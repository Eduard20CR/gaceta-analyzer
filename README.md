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
npm run build:api   # one zip per Lambda in apps/api/dist/, then a smoke test of each zip
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

## Run the web app locally

```sh
cp apps/web/.env.example apps/web/.env.local   # then set VITE_DEV_API_PROXY_TARGET
npm run dev -w @gaceta/web                     # http://localhost:5173
```

The dev server forwards every `/api` request to the deployed API Gateway URL in `VITE_DEV_API_PROXY_TARGET`, so the app uses the same relative paths as in production. `npm run build -w @gaceta/web` writes the production files to `apps/web/dist/`.

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

Everything in AWS is created by Terraform, in region `us-east-1` (ADR-0011):

- [`infra/bootstrap/`](infra/bootstrap/README.md) is applied once, by hand. It creates the Terraform state bucket and the role GitHub Actions uses. **Its README has the manual setup steps**: applying the bootstrap, the GitHub variables, the SSM secrets and the DeepSeek spending limit.
- `infra/main/` holds the rest of the app and is deployed by GitHub Actions (added in milestone M3). Its state lives in the bootstrap's state bucket, whose name is passed at init time. To only check the files locally, without AWS credentials:

  ```sh
  cd infra/main
  terraform fmt -check
  terraform init -backend=false
  terraform validate
  ```

`infra/main/` has one input variable, `budget_alert_email`: the address that receives the AWS Budgets alarm (an email at 80% of USD 10 in a month, plus one when AWS forecasts the month will end above USD 10; NFR-COST-01). It is personal, so it is never written in the repository:

- **GitHub Actions:** create the repository variable `BUDGET_ALERT_EMAIL` (see [`infra/bootstrap/README.md`](infra/bootstrap/README.md), step 2). The deploy workflow passes it to Terraform as `TF_VAR_budget_alert_email`.
- **Locally:** copy `infra/main/terraform.tfvars.example` to `infra/main/terraform.tfvars` (git-ignored) and write the address there, or pass `-var 'budget_alert_email=name@example.com'`.

`terraform validate` does not need it; `plan` and `apply` do.
