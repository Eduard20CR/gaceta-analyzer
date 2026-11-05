# CLAUDE.md — Gaceta Analyzer

## Project summary

Gaceta Analyzer is a single-user web app. The user uploads a long PDF (for example, La Gaceta, often 500+ pages), types what to look for (for example, "impuestos, aranceles"), and the app uses AI (DeepSeek) to return the pages and verbatim quotes related to those topics.
It is a TypeScript monorepo (npm workspaces): a React + Vite frontend on S3 + CloudFront, five Node.js Lambdas behind API Gateway, DynamoDB, S3, and Terraform with a single environment, deployed by GitHub Actions with OIDC.

**`docs/` is the source of truth.** Before working on anything, read the parts of these that apply to your task:

- `docs/README.md` — scope by version and conventions.
- `docs/architecture.md` — components, flow, data model, API contract and repository structure.
- `docs/requirements/functional.md` — `FR-XX` requirements and their acceptance criteria.
- `docs/requirements/non-functional.md` — `NFR-<AREA>-XX` requirements.
- `docs/adr/` — Architecture Decision Records.

## Language rules

- **English everywhere** in the repository: code, identifiers, file names, comments, tests, docs, ADRs, commit messages, branch names, issues and pull requests.
- **Spanish only** for text the end user sees: UI labels, buttons, messages, and the error messages the API returns to be shown to the user (for example, `"Contraseña incorrecta"`).

## Workflow for every session

1. **Pick the issue.** Find the open milestone with the lowest number in its name (`M0` first, then `M1`, …). Inside it, pick the open issue with the lowest number that:
   - is not labeled `blocked` or `manual-step`,
   - has every issue in its **Depends on** section closed, and
   - does not already have an open pull request (look for a PR whose body says `Closes #<n>`).
     If no issue qualifies, stop and say why instead of picking from a later milestone.
2. **Create a branch** named `<type>/<issue-number>-<short-slug>`, for example `feat/12-ai-client`. Map the issue's label to the type: `type:feature` → `feat`, `type:chore` → `chore`, `type:docs` → `docs`, `type:spike` → `spike`, `type:test` → `test`. Use `fix` for bug fixes.
3. **Implement the issue**, meeting every acceptance criterion. Add or update tests for the code you change.
4. **Run lint, typecheck and tests locally** before pushing (`npm run lint`, `npm run typecheck`, `npm test` from the repository root, once those scripts exist). Do not push if any of them fails.
5. **Open a pull request** with the same title as the issue. The body must include `Closes #<n>`, a summary of the changes, and how it was verified (commands run and their result). Tick in the PR the acceptance criteria you met.
6. **Never merge. Never push to `main`. Never close issues manually.** The owner reviews and merges; merging closes the issue.
7. **If an issue conflicts with the docs**, stop and comment on the issue explaining the conflict and which document should change, instead of guessing.
8. **If a decision changes**, add a new ADR (from `docs/adr/0000-template.md`) or edit an ADR that is still `Proposed`, in the same pull request. An `Accepted` ADR is never edited to change its decision: write a new one and mark the old one `Superseded by ADR-XXXX`. If you add or move a file that `docs/architecture.md` lists, update that document in the same pull request.

## Code standards

- TypeScript with `strict: true` everywhere. No `any` unless there is a comment explaining why.
- Code must be readable by a junior developer:
  - Short functions with descriptive names.
  - No clever one-liners; prefer a few clear lines over a dense expression.
  - Comments where the intent is not obvious (the _why_, not the _what_).
- Types and constants shared by the web app and the API live in `packages/shared`.
- All DynamoDB access goes through `apps/api/src/lib/jobs-repository.ts`, all S3 access through `lib/storage.ts`, all AI calls through `lib/ai-client.ts`, and all PDF reading through `lib/pdf.ts`.
- Vitest tests for the logic in `apps/api/src/lib/` and `packages/shared`. Mock AWS and DeepSeek; tests never call real services.

## Security and logging

- **Never log the PDF text, the app password or API keys.** Log page numbers, counts, ids and durations instead.
- Secrets live only in SSM Parameter Store. Never put them in code, tests, fixtures, Terraform variables or `.env` files committed to the repository.
- Logs are JSON and include `jobId` when available (use `lib/logger.ts`).
