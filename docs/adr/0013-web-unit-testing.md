# ADR-0013 — Web unit tests with Vitest, React Testing Library, jsdom and MSW

- **Status:** Proposed
- **Date:** 2026-11-05

## Context

NFR-MAINT-04 originally required tests only for the analysis logic in the API. The web app also has logic that can break silently and that the user would notice first: the typed API client (401/403 handling, no `Authorization` header on the S3 upload), the stored password, form validation, the route guard, polling that must stop, and the findings filter. Manual testing of all of this before each merge is slow and easy to forget.

Constraints:

- The API and `packages/shared` already use **Vitest** (issue #3). Using a second test runner would mean two configurations and two sets of APIs to learn.
- The web app is built with **Vite** (ADR-0008), so its tests should reuse the same Vite config and plugins.
- Tests must run in CI on every PR (NFR-DEP-04) without real services: no real API, S3 or DeepSeek.
- Tests should be readable by a junior developer and check what the user sees, not internal implementation details.

## Decision

- **Vitest** (the same major version as the rest of the monorepo) runs the web tests, configured in `apps/web` on top of `vite.config.ts`.
- **jsdom** is the test environment for files that render components.
- **React Testing Library** (`@testing-library/react`) renders components, and **`@testing-library/user-event`** simulates typing and clicking. Queries prefer accessible roles and visible Spanish text (`getByRole('button', { name: 'Analizar' })`).
- **`@testing-library/jest-dom`** adds DOM matchers (`toBeDisabled`, `toBeInTheDocument`) through its Vitest entry point.
- **MSW** (Mock Service Worker) intercepts `fetch` and `XMLHttpRequest` at the network level, so the real API client code runs in tests against fake `/api/...` responses and a fake S3 upload URL.
- Tests live in `apps/web/tests/`, mirroring `src/` (same convention as `apps/api/tests/`). No snapshot tests.
- The root `npm test` runs the web tests together with the other workspaces, so CI covers them without changes to `ci.yml`.

## Alternatives considered

- **Vitest Browser Mode (Playwright):** runs tests in a real Chromium, which is more accurate than jsdom. Rejected for now: CI must download and cache a browser, tests are slower, and the app's logic does not depend on real layout or rendering. Revisit if jsdom gaps cause false results (for example with the PDF viewer in M5).
- **happy-dom:** faster than jsdom, but less complete and with more differences from real browsers. The test suite is small, so speed is not the bottleneck.
- **Jest:** would duplicate the Vitest setup already used in the API, and needs extra configuration for ESM and Vite.
- **Mocking `fetch` with `vi.fn()` in each test:** simpler at first, but each test re-implements the HTTP layer, and the `XMLHttpRequest` upload with progress is hard to fake by hand.
- **End-to-end tests (Playwright against the deployed app):** valuable but slower and dependent on a real environment. Out of scope; the end-to-end check stays manual (#41).

## Consequences

- Each frontend issue adds tests for its own acceptance criteria, so regressions in login, upload, polling and results are caught in CI.
- More dev dependencies in `apps/web` (Testing Library packages, jsdom, MSW).
- jsdom does not do layout, so checks such as "nothing overflows at 375 px" (NFR-UX-02) remain manual.
- Rendering pdf.js in jsdom is not realistic; the viewer (#42) tests its navigation logic with the PDF library mocked.
- Revisit this decision if Vitest Browser Mode becomes needed for realistic rendering, or if E2E tests are added.
