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
