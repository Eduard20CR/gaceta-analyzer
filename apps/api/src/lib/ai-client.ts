// All calls to the AI model go through this module (ADR-0007), so switching
// providers only changes this file.
//
// DeepSeek is called with the `openai` SDK, because its API is OpenAI-compatible.
// This module never reads SSM or environment variables: the API key and the model
// are passed in, which keeps it easy to test with a fake chat function.
//
// NEVER log the block text, the query or the AI's answer (NFR-OBS-03).

import OpenAI from 'openai';
import { z } from 'zod';

import { RELEVANCES } from '@gaceta/shared';
import type { Relevance } from '@gaceta/shared';

import { pageMarker } from './blocks';
import { createLogger } from './logger';
import type { Logger } from './logger';

const DEEPSEEK_BASE_URL = 'https://api.deepseek.com';

/** Waits before each retry: 2 s, 4 s, 8 s (NFR-REL-01). */
export const RETRY_DELAYS_MS = [2000, 4000, 8000] as const;

// One call should never take this long; without a limit a stuck connection
// could use up the whole Lambda run (15 min, NFR-REL-05).
const REQUEST_TIMEOUT_MS = 2 * 60 * 1000;

/**
 * The instructions sent with every call. It is a constant on purpose: an identical
 * system message lets DeepSeek reuse its prompt cache (NFR-COST-06). The query and
 * the block text go only in the user message.
 *
 * The page marker example must match `pageMarker` in lib/blocks.ts (a test checks it).
 */
export const SYSTEM_PROMPT = `You help a person find what matters to them in a long official document (for example, Costa Rica's official gazette, La Gaceta).

You receive a search query and the text of some consecutive pages of the document. Each page starts with a marker line such as:
${pageMarker(14)}
All text after a marker, until the next marker, belongs to that page.

Find every passage related to any topic of the search query. For each one, return:
- "page": the number from the marker of the page where the passage is.
- "topic": the topic of the query that it relates to, in the document's language.
- "quote": the passage copied exactly, word for word, in the document's language. Do not translate, summarize, fix or join text from different places. Keep it short: the sentence or paragraph that shows the relation.
- "reason": one sentence in Spanish explaining why the passage is relevant.
- "relevance": "high" when the passage is directly about the topic, "medium" when it is clearly related, "low" when it is only loosely related.

Answer only with a JSON object of this exact shape:
{"findings": [{"page": 14, "topic": "...", "quote": "...", "reason": "...", "relevance": "high"}]}
If nothing is related, answer {"findings": []}.`;

/** A finding as the AI returns it, before the quote is verified (lib/findings.ts). */
export interface RawFinding {
  page: number;
  topic: string;
  quote: string;
  reason: string;
  relevance: Relevance;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface AnalyzeBlockResult {
  findings: RawFinding[];
  /** Tokens of every attempt that got an answer, including retried ones (NFR-OBS-02). */
  usage: TokenUsage;
}

/** What is sent to the model in one call. */
export interface ChatRequest {
  model: string;
  temperature: 0;
  response_format: { type: 'json_object' };
  messages: [
    { role: 'system'; content: string },
    { role: 'user'; content: string },
  ];
}

/** The part of the model's answer this module uses. */
export interface ChatResponse {
  content: string | null;
  usage: TokenUsage;
}

/** Sends one request to the model. Replaced by a fake in tests. */
export type ChatFunction = (request: ChatRequest) => Promise<ChatResponse>;

export interface AiClientOptions {
  apiKey: string;
  model: string;
  /** Defaults to a DeepSeek call through the `openai` SDK. */
  chat?: ChatFunction;
  /** Defaults to a real wait; tests pass a fake so they do not wait. */
  sleep?: (ms: number) => Promise<void>;
  /** Pass `createLogger({ jobId })` so warnings include the job id. */
  logger?: Logger;
}

export interface AiClient {
  analyzeBlock(input: {
    blockText: string;
    query: string;
  }): Promise<AnalyzeBlockResult>;
}

/** Thrown when a block still fails after every retry. */
export class AiBlockFailedError extends Error {
  constructor(attempts: number, cause: unknown) {
    super(`The AI call failed after ${attempts} attempts`, { cause });
    this.name = 'AiBlockFailedError';
  }
}

// Why an answer could not be used. The message never includes the answer text,
// so it is safe to log.
type InvalidAnswerReason = 'empty_answer' | 'invalid_json' | 'invalid_shape';

class InvalidAnswerError extends Error {
  readonly reason: InvalidAnswerReason;

  constructor(reason: InvalidAnswerReason) {
    super(`The AI answer could not be used: ${reason}`);
    this.name = 'InvalidAnswerError';
    this.reason = reason;
  }
}

const rawFindingSchema = z.object({
  page: z.int().positive(),
  topic: z.string().min(1),
  quote: z.string().min(1),
  reason: z.string(),
  relevance: z.enum(RELEVANCES),
});

// Only the top level is checked here. Each finding is checked on its own, so
// one bad finding does not throw away the good ones (NFR-REL-04).
const answerSchema = z.object({
  findings: z.array(z.unknown()),
});

export function createAiClient(options: AiClientOptions): AiClient {
  const chat = options.chat ?? createDeepSeekChat(options.apiKey);
  const sleep = options.sleep ?? wait;
  const logger = options.logger ?? createLogger();

  async function analyzeBlock(input: {
    blockText: string;
    query: string;
  }): Promise<AnalyzeBlockResult> {
    const request = buildRequest(options.model, input.query, input.blockText);
    const usage: TokenUsage = { inputTokens: 0, outputTokens: 0 };
    const attempts = RETRY_DELAYS_MS.length + 1;
    let lastError: unknown;

    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        const response = await chat(request);
        addUsage(usage, response.usage);
        const findings = parseAnswer(response.content, logger);
        return { findings, usage };
      } catch (error) {
        lastError = error;
        const delayMs = RETRY_DELAYS_MS[attempt - 1];
        if (delayMs === undefined) {
          break;
        }
        logger.warn('AI call failed, retrying', {
          attempt,
          delayMs,
          reason: describeError(error),
        });
        await sleep(delayMs);
      }
    }

    logger.error('AI call failed after every retry', {
      attempts,
      reason: describeError(lastError),
    });
    throw new AiBlockFailedError(attempts, lastError);
  }

  return { analyzeBlock };
}

function buildRequest(
  model: string,
  query: string,
  blockText: string,
): ChatRequest {
  return {
    model,
    temperature: 0,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: `Search query:\n${query}\n\nDocument pages:\n${blockText}`,
      },
    ],
  };
}

/** Turns the model's text into findings, or throws so the call is retried. */
function parseAnswer(content: string | null, logger: Logger): RawFinding[] {
  if (content === null || content.trim() === '') {
    throw new InvalidAnswerError('empty_answer');
  }

  let json: unknown;
  try {
    json = JSON.parse(content);
  } catch {
    throw new InvalidAnswerError('invalid_json');
  }

  const answer = answerSchema.safeParse(json);
  if (!answer.success) {
    throw new InvalidAnswerError('invalid_shape');
  }

  return keepValidFindings(answer.data.findings, logger);
}

function keepValidFindings(
  candidates: unknown[],
  logger: Logger,
): RawFinding[] {
  const findings: RawFinding[] = [];
  for (const candidate of candidates) {
    const result = rawFindingSchema.safeParse(candidate);
    if (result.success) {
      findings.push(result.data);
    }
  }

  const discardedCount = candidates.length - findings.length;
  if (discardedCount > 0) {
    // Only the counts: the findings contain document text (NFR-OBS-03).
    logger.warn('Discarded AI findings with an invalid shape', {
      discardedCount,
      keptCount: findings.length,
    });
  }
  return findings;
}

function addUsage(total: TokenUsage, extra: TokenUsage): void {
  total.inputTokens += extra.inputTokens;
  total.outputTokens += extra.outputTokens;
}

/**
 * A short, safe description of an error for the logs. Error messages from the
 * SDK or from JSON.parse may contain parts of the request or the answer, so only
 * the error name, our own reason, or the HTTP status is logged.
 */
function describeError(error: unknown): string {
  if (error instanceof InvalidAnswerError) {
    return error.reason;
  }
  if (error instanceof OpenAI.APIError) {
    return `api_error_${error.status ?? 'no_status'}`;
  }
  if (error instanceof Error) {
    return error.name;
  }
  return 'unknown_error';
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** The real chat function: DeepSeek through the `openai` SDK. */
function createDeepSeekChat(apiKey: string): ChatFunction {
  const openai = new OpenAI({
    apiKey,
    baseURL: DEEPSEEK_BASE_URL,
    // Retries are handled above with the delays NFR-REL-01 asks for, so the
    // SDK must not add its own.
    maxRetries: 0,
    timeout: REQUEST_TIMEOUT_MS,
  });

  return async (request) => {
    const completion = await openai.chat.completions.create(request);
    return {
      content: completion.choices[0]?.message.content ?? null,
      usage: {
        inputTokens: completion.usage?.prompt_tokens ?? 0,
        outputTokens: completion.usage?.completion_tokens ?? 0,
      },
    };
  };
}
