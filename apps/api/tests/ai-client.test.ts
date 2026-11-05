import { describe, expect, it, vi } from 'vitest';

import {
  AiBlockFailedError,
  SYSTEM_PROMPT,
  createAiClient,
} from '../src/lib/ai-client';
import type {
  ChatFunction,
  ChatRequest,
  ChatResponse,
  RawFinding,
} from '../src/lib/ai-client';
import { pageMarker } from '../src/lib/blocks';
import type { Logger } from '../src/lib/logger';

// No test calls DeepSeek: every client gets a fake `chat` function.

const finding: RawFinding = {
  page: 14,
  topic: 'impuestos',
  quote: 'Se reforma el impuesto sobre la renta',
  reason: 'Modifica un impuesto.',
  relevance: 'high',
};

function answer(
  content: string | null,
  usage = { inputTokens: 100, outputTokens: 20 },
): ChatResponse {
  return { content, usage };
}

function answerWithFindings(findings: unknown[]): ChatResponse {
  return answer(JSON.stringify({ findings }));
}

type LogFunction = Logger['warn'];

/** A logger that records calls instead of writing them. */
function createFakeLogger() {
  const warn = vi.fn<LogFunction>();
  const error = vi.fn<LogFunction>();
  const logger: Logger = { debug: vi.fn(), info: vi.fn(), warn, error };
  return { logger, warn, error };
}

/** Builds a client whose chat answers come from `responses`, in order. */
function createTestClient(responses: (ChatResponse | Error)[]) {
  const chat = vi.fn<ChatFunction>();
  for (const response of responses) {
    if (response instanceof Error) {
      chat.mockRejectedValueOnce(response);
    } else {
      chat.mockResolvedValueOnce(response);
    }
  }
  const sleep = vi.fn((_ms: number) => Promise.resolve());
  const fakeLogger = createFakeLogger();
  const client = createAiClient({
    apiKey: 'test-key',
    model: 'deepseek-v4-flash',
    chat,
    sleep,
    logger: fakeLogger.logger,
  });
  return {
    client,
    chat,
    sleep,
    warn: fakeLogger.warn,
    error: fakeLogger.error,
  };
}

const input = {
  blockText: `${pageMarker(14)}\nSe reforma el impuesto sobre la renta`,
  query: 'impuestos, aranceles',
};

function requestOfCall(
  chat: ReturnType<typeof vi.fn<ChatFunction>>,
  index: number,
): ChatRequest {
  const call = chat.mock.calls[index];
  if (call === undefined) {
    throw new Error(`No chat call at index ${index}`);
  }
  return call[0];
}

describe('analyzeBlock request', () => {
  it('uses temperature 0, JSON mode, the configured model and the system prompt', async () => {
    const { client, chat } = createTestClient([answerWithFindings([])]);

    await client.analyzeBlock(input);

    const request = requestOfCall(chat, 0);
    expect(request.model).toBe('deepseek-v4-flash');
    expect(request.temperature).toBe(0);
    expect(request.response_format).toEqual({ type: 'json_object' });
    expect(request.messages[0]).toEqual({
      role: 'system',
      content: SYSTEM_PROMPT,
    });
  });

  it('puts the query and the block text only in the user message', async () => {
    const { client, chat } = createTestClient([answerWithFindings([])]);

    await client.analyzeBlock(input);

    const request = requestOfCall(chat, 0);
    expect(request.messages[1].role).toBe('user');
    expect(request.messages[1].content).toContain(input.query);
    expect(request.messages[1].content).toContain(input.blockText);
    expect(SYSTEM_PROMPT).not.toContain(input.query);
  });

  it('sends the same system prompt in every call', async () => {
    const { client, chat } = createTestClient([
      answerWithFindings([]),
      answerWithFindings([]),
    ]);

    await client.analyzeBlock(input);
    await client.analyzeBlock({ blockText: 'otro bloque', query: 'aranceles' });

    const firstSystem = requestOfCall(chat, 0).messages[0].content;
    const secondSystem = requestOfCall(chat, 1).messages[0].content;
    expect(firstSystem).toBe(SYSTEM_PROMPT);
    expect(secondSystem).toBe(SYSTEM_PROMPT);
  });

  it('explains the page marker format used by lib/blocks.ts', () => {
    expect(SYSTEM_PROMPT).toContain(pageMarker(14));
  });
});

describe('analyzeBlock answer', () => {
  it('returns the findings and the token usage', async () => {
    const { client } = createTestClient([
      answer(JSON.stringify({ findings: [finding] }), {
        inputTokens: 1200,
        outputTokens: 80,
      }),
    ]);

    const result = await client.analyzeBlock(input);

    expect(result.findings).toEqual([finding]);
    expect(result.usage).toEqual({ inputTokens: 1200, outputTokens: 80 });
  });

  it('returns no findings when the AI finds nothing', async () => {
    const { client } = createTestClient([answerWithFindings([])]);

    const result = await client.analyzeBlock(input);

    expect(result.findings).toEqual([]);
  });

  it('drops a finding with an invalid relevance and logs one warning with counts only', async () => {
    const { client, warn } = createTestClient([
      answerWithFindings([
        finding,
        { ...finding, relevance: 'very high' },
        { ...finding, page: 15 },
      ]),
    ]);

    const result = await client.analyzeBlock(input);

    expect(result.findings).toHaveLength(2);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(
      'Discarded AI findings with an invalid shape',
      { discardedCount: 1, keptCount: 2 },
    );
  });

  it.each([
    ['page as text', { ...finding, page: '14' }],
    ['page 0', { ...finding, page: 0 }],
    ['empty quote', { ...finding, quote: '' }],
    ['missing topic', { ...finding, topic: undefined }],
  ])('drops a finding with %s', async (_label, invalidFinding) => {
    const { client } = createTestClient([
      answerWithFindings([finding, invalidFinding]),
    ]);

    const result = await client.analyzeBlock(input);

    expect(result.findings).toEqual([finding]);
  });
});

describe('analyzeBlock retries', () => {
  it('returns the findings after two failures, waiting 2 s and then 4 s', async () => {
    const { client, chat, sleep } = createTestClient([
      new Error('Network error'),
      new Error('Network error'),
      answerWithFindings([finding]),
    ]);

    const result = await client.analyzeBlock(input);

    expect(result.findings).toEqual([finding]);
    expect(chat).toHaveBeenCalledTimes(3);
    expect(sleep.mock.calls).toEqual([[2000], [4000]]);
  });

  it('throws after four failures, waiting 2 s, 4 s and 8 s', async () => {
    const { client, chat, sleep, error } = createTestClient([
      new Error('Network error'),
      new Error('Network error'),
      new Error('Network error'),
      new Error('Network error'),
    ]);

    await expect(client.analyzeBlock(input)).rejects.toBeInstanceOf(
      AiBlockFailedError,
    );
    expect(chat).toHaveBeenCalledTimes(4);
    expect(sleep.mock.calls).toEqual([[2000], [4000], [8000]]);
    expect(error).toHaveBeenCalledTimes(1);
  });

  it('retries malformed JSON', async () => {
    const { client, chat } = createTestClient([
      answer('{"findings": [ this is not json'),
      answerWithFindings([finding]),
    ]);

    const result = await client.analyzeBlock(input);

    expect(chat).toHaveBeenCalledTimes(2);
    expect(result.findings).toEqual([finding]);
  });

  it.each([
    ['an empty answer', answer('')],
    ['a null answer', answer(null)],
    ['JSON without findings', answer('{"results": []}')],
    ['findings that are not a list', answer('{"findings": "none"}')],
  ])('retries %s', async (_label, badAnswer) => {
    const { client, chat } = createTestClient([
      badAnswer,
      answerWithFindings([]),
    ]);

    await client.analyzeBlock(input);

    expect(chat).toHaveBeenCalledTimes(2);
  });

  it('adds up the tokens of a retried answer and the final one', async () => {
    const { client } = createTestClient([
      answer('not json', { inputTokens: 100, outputTokens: 5 }),
      answer(JSON.stringify({ findings: [] }), {
        inputTokens: 100,
        outputTokens: 10,
      }),
    ]);

    const result = await client.analyzeBlock(input);

    expect(result.usage).toEqual({ inputTokens: 200, outputTokens: 15 });
  });

  it('never logs the answer text or the block text', async () => {
    const secretAnswer = '{"findings": [ texto del documento';
    const { client, warn, error } = createTestClient([
      answer(secretAnswer),
      answerWithFindings([{ ...finding, relevance: 'wrong' }]),
    ]);

    await client.analyzeBlock(input);

    const logged = JSON.stringify([warn.mock.calls, error.mock.calls]);
    expect(logged).not.toContain('texto del documento');
    expect(logged).not.toContain('impuesto sobre la renta');
    expect(warn).toHaveBeenCalledWith('AI call failed, retrying', {
      attempt: 1,
      delayMs: 2000,
      reason: 'invalid_json',
    });
  });
});
