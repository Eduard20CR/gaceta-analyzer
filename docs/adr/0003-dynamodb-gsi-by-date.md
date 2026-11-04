# ADR-0003 — DynamoDB with one table and an index by date

- **Status:** Proposed
- **Date:** 2026-11-04

## Context

Jobs must be stored and queried in two ways:

1. A single job by its `id`.
2. All jobs, newest first, paginated.

DynamoDB only allows efficient queries by key. The primary key (`id`) solves query 1, but not query 2.

## Decision

- Table `jobs` with partition key `id`.
- **Global secondary index (GSI)** `by-created-at`:
  - Partition key: `entityType`, which is always `"JOB"`.
  - Sort key: `createdAt`, an ISO 8601 date in UTC.
- `list-jobs` runs a `Query` on the index with `ScanIndexForward = false`.
- **On-demand** capacity mode.

## Alternatives considered

- **Scan the whole table and sort in the Lambda:** simpler and valid for small data, but cost and latency grow with every job, and sorted pagination becomes awkward.
- **Relational database (RDS, Aurora Serverless):** supports any query, but has a fixed monthly cost and more administration. Overkill here.

## Consequences

- The history query is efficient and paginated regardless of how many jobs exist.
- All jobs live in **a single partition of the index**. In high-traffic applications this is bad practice ("hot partition"). With a single user it has no impact.
- If there were ever multiple users, the index partition key would become `userId`.
- `createdAt` must **always be stored in UTC and in full ISO format**, because the index sorts it as text. Mixing formats would produce a wrong order.
