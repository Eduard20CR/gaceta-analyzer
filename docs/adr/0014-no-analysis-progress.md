# ADR-0014 — No per-block analysis progress

- **Status:** Accepted
- **Date:** 2026-11-05

## Context

FR-03 and FR-04 asked `analyze-pdf` to store `processedBlocks` after every block, so the web app could show "Analizando bloque 7 de 30" while polling. Blocks run in parallel (up to 5 at a time), so their progress writes can reach DynamoDB out of order; keeping the number correct needed extra code (a chain of writes in the handler, or a conditional write in the repository). The owner only cares about the final result, not about watching the analysis advance.

## Decision

`analyze-pdf` does not store progress during the analysis. It stores `pageCount` and `totalBlocks` only once, together with the rest of the summary, when the job is `COMPLETED`. While a job is `PENDING_UPLOAD` or `PROCESSING`, the web app only says that the analysis is running.

## Alternatives considered

- **Progress through a chain of writes in the handler:** correct, but it is the most complex part of the handler for a feature nobody needs.
- **Progress with a conditional write (`processedBlocks < :new`):** also correct, but it moves the same complexity into the repository.

## Consequences

- Simpler handler and repository: one DynamoDB write when the job starts and one when it ends.
- About one write per block less per analysis (a few cents a year at most; not the reason for the change).
- A long analysis shows no sign of advancing; the 20-minute expiration (FR-04) still turns a stuck job into `FAILED`.
- The local CLI keeps printing per-block progress on the console: that is `lib/analysis.ts`'s `onProgress`, which is not stored anywhere.
- Revisit if analyses become long enough that the user needs reassurance that they are advancing.
