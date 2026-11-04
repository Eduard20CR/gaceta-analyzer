# ADR-0002 — One Lambda per operation, in a single package, bundled separately

- **Status:** Proposed
- **Date:** 2026-11-04

## Context

The backend has four operations: create job, analyze PDF, get job and list jobs, plus password validation (see ADR-0006). The analysis operation is very different from the others: it is triggered by S3, runs for minutes and needs more memory. The others answer HTTP requests in milliseconds.

## Decision

- **One Lambda per operation**: `authorizer`, `create-job`, `analyze-pdf`, `get-job`, `list-jobs`.
- All of them live in **a single package** (`apps/api`) and share the code in `src/lib/`.
- **esbuild** produces one `.zip` per handler, containing only the code that handler uses.
- **Node.js 22.x** runtime (or the latest LTS available on Lambda at implementation time), **arm64** architecture.

## Alternatives considered

- **Separate projects per Lambda:** would duplicate shared code (DynamoDB access, logging) or require publishing it as a package.
- **A single Lambda with a router for everything:** fewer cold starts, but it mixes the analysis Lambda's configuration (15 min, 3008 MB) with the API's, and IAM permissions would be broader than necessary.
- **The three API Lambdas merged into one, plus the analysis one:** a reasonable option. Separate Lambdas are preferred because each gets minimal IAM permissions and the structure is easier to understand.

## Consequences

- Each Lambda has its own IAM role, memory and timeout.
- A change in `lib/` can affect every Lambda, which is why tests for `lib/` matter.
- arm64 is cheaper than x86. Since every dependency is JavaScript or WebAssembly, there are no compilation issues.
