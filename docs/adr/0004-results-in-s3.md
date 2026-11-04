# ADR-0004 — Findings in S3, summary in DynamoDB

- **Status:** Proposed
- **Date:** 2026-11-04

## Context

An analysis can produce anywhere from zero to hundreds of findings, each with a quote and a reason. A DynamoDB item has a **400 KB** limit.

## Decision

- The full list of findings is stored in `results/{id}.json` in S3.
- DynamoDB only stores the summary: `findingsCount`, `relevantPages` and `resultsKey`.
- `get-job` reads the DynamoDB item and, if the job is completed, also the JSON from S3.

## Alternatives considered

- **Everything in DynamoDB:** simpler, but a document with many findings would exceed the limit and the write would fail at the end of the analysis, losing all the work.
- **One item per finding in DynamoDB:** no size limit, but adds batch writes and more complex queries with no real benefit.

## Consequences

- No practical limit on the number of findings.
- `get-job` performs two reads (DynamoDB and S3) when the job is completed.
- The 30-day deletion rule applies only to the `uploads/` prefix. Results are kept even after the PDF is deleted.
