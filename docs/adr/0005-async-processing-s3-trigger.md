# ADR-0005 — Asynchronous processing with an S3 trigger and polling

- **Status:** Proposed
- **Date:** 2026-11-04

## Context

Analyzing a 120-page PDF takes one to three minutes, and La Gaceta documents can exceed 500 pages. API Gateway cuts requests off at 30 seconds. Also, PDFs of up to 100 MB should not go through a Lambda: API Gateway limits request body size.

## Decision

1. The browser uploads the PDF **directly to S3** using a presigned POST.
2. The S3 `ObjectCreated` event (prefix `uploads/`) triggers `analyze-pdf`.
3. The browser polls `GET /api/jobs/{id}` every 4 seconds until the job finishes.
4. Inside `analyze-pdf`, blocks are processed **in parallel with a concurrency limit** (5 by default).
5. Stuck jobs are detected **at read time** (see "Job states" in `architecture.md`), not by a scheduled process.

## Alternatives considered

- **Synchronous request:** impossible due to the 30-second limit.
- **Step Functions with a Map state:** true parallelism across Lambdas and per-block retries. Overkill for one user; adds another service to learn and pay for.
- **SQS between S3 and the Lambda:** more resilient to spikes, unnecessary with one user.
- **WebSockets to notify on completion:** better experience than polling, but much more complexity.
- **Scheduled Lambda (EventBridge) to mark stuck jobs:** works, but costs an invocation on every schedule tick. Computing expiration at read time achieves the same result for free.

## Consequences

- The real limit is the Lambda timeout (15 minutes). There is no page limit. A 500-page PDF is about 125 blocks; with 5 in parallel and 5 to 15 seconds per call, it should take 2 to 6 minutes. If a very large document approached 15 minutes, `MAX_CONCURRENCY` would be increased before considering Step Functions.
- S3 can deliver the same event more than once. That is why the transition to `PROCESSING` uses a **conditional write** (only if the status is `PENDING_UPLOAD`), and duplicate events are ignored.
- If the Lambda times out, the job would stay in `PROCESSING`. That is why `get-job` and `list-jobs` report any job that has been in that state for more than 20 minutes as `FAILED`.
- The expired status is only computed in the response; it is not written back to DynamoDB.
