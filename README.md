# Gaceta Analyzer

Gaceta Analyzer is a single-user web app. You upload a long PDF (for example, La Gaceta, Costa Rica's official gazette, often 500+ pages), write the topics to look for (for example, "impuestos, aranceles"), and the app uses AI (DeepSeek) to return the pages and verbatim quotes related to those topics.

**[`docs/`](docs/README.md) is the source of truth** for requirements, architecture and decisions (ADRs). Start there before changing anything.

## Prerequisites

- Node.js, at the version in [`.nvmrc`](.nvmrc) (run `nvm use` if you use nvm).
- npm (comes with Node.js).

## Local setup

From the repository root:

```sh
npm install         # installs every workspace and links them together
npm run lint        # ESLint on all workspaces (no warnings allowed)
npm run typecheck   # TypeScript check of every workspace
npm test            # Vitest tests of every workspace that has them
```

`npm run format` rewrites files with Prettier, and `npm run format:check` only checks them.

## Analyze a PDF locally

The CLI runs the same analysis as the `analyze-pdf` Lambda on a PDF on your computer, so you can try prompts and block sizes without deploying anything. It calls DeepSeek, so it costs a few cents per document.

```sh
export DEEPSEEK_API_KEY=sk-…         # your DeepSeek key; never commit it
export DEEPSEEK_MODEL=deepseek-v4-flash   # optional, this is the default

npm run analyze:local -w @gaceta/api -- path/to/gaceta.pdf --query "impuestos, aranceles"
```

Options:

| Option                | Default | Meaning                                                  |
| --------------------- | ------- | -------------------------------------------------------- |
| `--query "<text>"`    | —       | Required. What to look for.                              |
| `--pages-per-block N` | `5`     | Pages sent to the AI in each call (minimum 2, ADR-0012). |
| `--concurrency N`     | `5`     | AI calls running at the same time.                       |
| `--out results.json`  | —       | Also writes the findings in the shape of the S3 results. |

Paths are relative to the folder where you run the command. Progress goes to stderr and the summary and findings to stdout.

## Repository map

| Path                 | Contents                                                                     |
| -------------------- | ---------------------------------------------------------------------------- |
| `apps/web/`          | React + Vite frontend (the UI, in Spanish)                                   |
| `apps/api/`          | The five Lambda handlers, their shared `lib/` modules, tests and `build.mjs` |
| `packages/shared/`   | Types, constants and the API contract shared by the web app and the API      |
| `infra/`             | Terraform: `bootstrap/` (state bucket and OIDC role) and `main/`             |
| `docs/`              | Requirements, architecture and ADRs                                          |
| `.claude/`           | `CLAUDE.md`, the rules every Claude session follows in this repository       |
| `.github/workflows/` | `ci.yml` (checks on every pull request) and `deploy.yml`                     |

Some of these folders do not exist yet; they are added by the milestones in [`docs/architecture.md`](docs/architecture.md#repository-structure).

## Deployment

To be completed in M3 (infrastructure), together with the manual setup steps.
