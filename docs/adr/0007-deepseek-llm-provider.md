# ADR-0007 — DeepSeek as the AI provider

- **Status:** Proposed
- **Date:** 2026-11-04

## Context

Each text block is sent to a language model to find fragments related to the search query. The Python proof of concept with DeepSeek gave good results at low cost (USD 0.05 to 0.10 per document).

## Decision

- Use **DeepSeek** with the `deepseek-v4-flash` model, configurable through the `DEEPSEEK_MODEL` variable.
- Call it with the `openai` npm SDK pointed at `https://api.deepseek.com`, since the API is OpenAI-compatible.
- Request JSON mode (`response_format: json_object`) with `temperature: 0`.
- Validate the response with a schema (Zod) before using it.
- All model access goes through `lib/ai-client.ts`, so switching providers means touching a single file.

## Alternatives considered

- **Claude on Amazon Bedrock:** data stays inside AWS and authentication is through IAM. More expensive per document. A good alternative if document confidentiality becomes a requirement.
- **OpenAI:** comparable quality, more expensive.

## Consequences

- Very low cost per analysis.
- PDF text is sent to an external provider with servers outside Costa Rica. For public documents such as La Gaceta this is not a problem. For internal documents, check the workplace policy before use.
- DeepSeek changed model names and pricing several times during 2026. The model is configurable so code changes are not needed.
