# ADR-0012 — Block size chosen per job, fixed overlap of 1 page

- **Status:** Proposed
- **Date:** 2026-11-04

## Context

The number of pages sent to the AI in each call affects quality, speed and cost. Small blocks give the model less text to scan, which usually improves precision but costs more calls. Large blocks reduce calls but may dilute attention. The best value may vary by document, and the user wants to experiment with it.

The overlap between blocks exists so a topic that starts at the end of one page and continues on the next is not split. One page is enough for that.

## Decision

- **Pages per block** is chosen **per job** in an "Advanced settings" section of the form.
  - Whole number, minimum **2**, no maximum, default **5**.
  - Stored in the job (`pagesPerBlock`) so each result records how it was produced.
- The **overlap is always 1 page** and is not configurable.
- The default and the overlap are constants in `packages/shared`, used by both the web app and the API.

## Alternatives considered

- **Environment variable for the whole system:** changing it requires a deploy and would not record which value produced each result.
- **Configurable overlap too:** adds a setting with almost no practical benefit and opens invalid combinations.
- **A maximum block size:** rejected by the user. See consequences.

## Consequences

- The minimum of 2 is required by the fixed overlap: with 1 page per block and 1 overlapping page, the algorithm would never advance.
- With no maximum, very large blocks are allowed. The trade-offs, which the UI should hint at under the field:
  - Fewer, longer calls, so less parallelism and possibly a slower analysis.
  - Each call returns more findings; if the model's output limit is reached, the response may be cut off and that block fails (and is retried, then marked as failed).
  - If a block exceeds the model's context window, the call fails. With current models this would take thousands of pages.
- Results from jobs with different block sizes can be compared, which helps tune the default over time.
