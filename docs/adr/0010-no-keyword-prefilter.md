# ADR-0010 — No keyword pre-filter

- **Status:** Proposed
- **Date:** 2026-11-04

## Context

To reduce cost, an option was evaluated: search each page for keywords with plain code and send only the matching pages to the AI.

## Decision

**No** pre-filter. Every page is sent to the AI.

## Alternatives considered

- **Keyword pre-filter:** could cut cost to a fraction, but a topic can appear without the exact words (for example, "derechos de importación" instead of "aranceles"). Missing an important change is far worse than the extra cost.

## Consequences

- Estimated cost of USD 0.05 to 0.10 for a document of about 120 pages, and proportionally more for larger ones. Considered acceptable.
- Revisit this decision if usage grows significantly or the cost per document rises.
