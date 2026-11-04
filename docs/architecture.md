# Architecture

## Overview

The whole application is served from **a single URL** through CloudFront. Static files come from one S3 bucket and every path under `/api/*` is forwarded to API Gateway.

```
                         https://<id>.cloudfront.net
                                    │
                         ┌──────────▼───────────┐
                         │      CloudFront      │
                         └───┬──────────────┬───┘
               /* (default)  │              │  /api/*
                             ▼              ▼
              ┌───────────────────┐   ┌──────────────────────┐  1. valid password?  ┌────────────┐
              │  S3 "web" bucket  │   │   API Gateway (HTTP) │ ───────────────────► │ authorizer │ ──► SSM
              │  (React build)    │   │                      │ ◄─────────────────── │            │
              │  private, OAC     │   └──┬────────┬────────┬─┘  yes / no (5 min)    └────────────┘
              └───────────────────┘      │        │        │  2. only if valid, forwards to the handler
                         POST /api/jobs  │        │        │  GET /api/jobs
                                         ▼        │        ▼
                             ┌────────────────┐   │   ┌────────────────┐
                             │   create-job   │   │   │   list-jobs    │
                             └───┬────────┬───┘   │   └───────┬────────┘
                                 │        │       │ GET /api/jobs/{id}
                                 │        │       ▼           │
                                 │        │  ┌────────────────┐
                                 │        │  │    get-job     │
                                 │        │  └──┬──────────┬──┘
                                 │        ▼     ▼          │  ▼
                                 │   ┌──────────────────────────┐
                                 │   │   DynamoDB  "jobs"       │
                                 │   │   + GSI "by-created-at"  │
                                 │   └──────────────────────────┘
                                 │        ▲
                                 ▼        │ updates status and progress
                     ┌───────────────────────┐   ObjectCreated event    ┌────────────────┐
                     │  S3 "data" bucket     │ ───────────────────────► │  analyze-pdf   │ ──► DeepSeek API
                     │  uploads/{id}.pdf     │                          │                │
                     │  results/{id}.json    │ ◄─────────────────────── │                │
                     └───────────────────────┘   stores results         └────────────────┘
                           ▲
                           │ direct POST/GET with presigned URLs (the PDF never goes through a Lambda)
                       Browser
```

## Components

| Component | Technology | Responsibility |
|---|---|---|
| Web | React + Vite + TypeScript | Form, PDF upload, status polling, results, history, viewer (v1.1) |
| CloudFront | Distribution with two origins | Single URL for the web app and the API, HTTPS, caching of static files (see ADR-0008) |
| S3 `web` bucket | Private, Origin Access Control (OAC) | Built frontend files. Only CloudFront can read it |
| CloudFront Function `spa-rewrite` | Viewer request, default behavior | Rewrites app routes such as `/jobs/3f6c…` to `/index.html` so React Router handles them |
| API Gateway | HTTP API | `/api/*` routes, invokes the authorizer |
| `authorizer` | Node.js Lambda | Validates the password for **every** route before it reaches a handler (see ADR-0006) |
| `create-job` | Node.js Lambda | Validates input, creates the job in DynamoDB, generates the presigned upload |
| `analyze-pdf` | Node.js Lambda | Triggered by S3. Extracts text, queries the AI, verifies quotes, stores results |
| `get-job` | Node.js Lambda | Returns a job with its results and a presigned read URL for the PDF |
| `list-jobs` | Node.js Lambda | Returns the paginated history, newest first |
| DynamoDB `jobs` | On-demand | Data and status of each job |
| S3 `data` bucket | Private | Uploaded PDFs and results JSON |
| SSM Parameter Store | `SecureString` | App password and DeepSeek API key |
| DeepSeek | OpenAI-compatible API | Analysis of each text block |

## CloudFront configuration

| Behavior | Origin | Cache | Notes |
|---|---|---|---|
| `/api/*` | API Gateway | **Disabled** (`CachingDisabled` managed policy) | Origin request policy `AllViewerExceptHostHeader`, so the `Authorization` header, query string and body reach API Gateway. All HTTP methods allowed |
| `/*` (default) | S3 `web` bucket via OAC | Enabled (`CachingOptimized`) | CloudFront Function `spa-rewrite` on viewer request. `GET` and `HEAD` only |

Rules worth knowing:

- **SPA routing is done with a CloudFront Function, not with custom error responses.** Custom error responses apply to the whole distribution, so mapping 403/404 to `index.html` would also turn the API's real 403 and 404 responses into an HTML page. The function only rewrites paths in the default behavior that have no file extension (for example `/jobs/3f6c…` → `/index.html`).
- **API Gateway routes include the `/api` prefix** (`/api/jobs`, `/api/jobs/{id}`, `/api/auth/check`), because CloudFront forwards the path as is.
- **Cache headers on deploy:** `index.html` is uploaded with `Cache-Control: no-cache`, and the hashed files in `assets/` with `Cache-Control: public, max-age=31536000, immutable`. After each deploy, a CloudFront invalidation of `/index.html` is enough.
- **Default domain:** `https://<id>.cloudfront.net`. A custom domain (ACM certificate in us-east-1 + DNS) can be added later without code changes.

## Main flow

1. **Create job.** The web app sends `POST /api/jobs` with `{ name, query, fileName, fileSize, pagesPerBlock }`.
   `create-job` validates the input, generates an `id` (UUID v4) and stores the job with status `PENDING_UPLOAD`. It responds with the job and a **presigned POST** for `uploads/{id}.pdf` that requires `application/pdf` and at most 100 MB.
2. **Upload PDF.** The browser uploads the file directly to the S3 `data` bucket using that presigned POST and shows progress.
3. **Analyze.** S3 triggers `analyze-pdf` with the key `uploads/{id}.pdf`. The Lambda:
   1. Extracts the `id` from the key.
   2. Changes the status from `PENDING_UPLOAD` to `PROCESSING` **with a conditional write**. If the status was not `PENDING_UPLOAD`, the event is a duplicate and is ignored.
   3. Downloads the PDF and extracts the text of each page.
   4. Builds the blocks using the job's `pagesPerBlock` and a fixed overlap of 1 page, and processes them in parallel (at most 5 at a time). After each block, it updates `processedBlocks`.
   5. Verifies quotes, removes duplicates and sorts.
   6. Stores the findings in `results/{id}.json`.
   7. Changes the status to `COMPLETED` with the summary, or to `FAILED` with an error message.
4. **Poll.** The web app calls `GET /api/jobs/{id}` every 4 seconds until the status is `COMPLETED` or `FAILED`.
5. **History.** The web app calls `GET /api/jobs` for the home page.

## Job states

```
PENDING_UPLOAD ──(PDF lands in S3)──► PROCESSING ──(success)──► COMPLETED
      │                                   │
      │ (> 1 h without upload)            │ (error or > 20 min)
      ▼                                   ▼
    FAILED                              FAILED
```

The time-based expirations (1 h and 20 min) are computed **at read time** by `get-job` and `list-jobs`: if a job has been in that state for too long, they report it as `FAILED`. There is no scheduled process, event or extra cost involved. The logic lives in a single shared function so both handlers behave the same.

## Data model

### DynamoDB table `jobs`

| Attribute | Type | Example | Notes |
|---|---|---|---|
| `id` | String | `"3f6c…"` | **Table partition key** |
| `entityType` | String | `"JOB"` | Always `"JOB"`. **GSI partition key** |
| `createdAt` | String (ISO 8601 UTC) | `"2026-11-04T20:18:00.000Z"` | **GSI sort key** |
| `updatedAt` | String (ISO 8601 UTC) | | |
| `name` | String | `"Gaceta 4 de noviembre"` | |
| `query` | String | `"impuestos, aranceles"` | The search query |
| `pagesPerBlock` | Number | `5` | Chosen in the advanced settings. Minimum 2 |
| `fileName` | String | `"gaceta-2026-11-04.pdf"` | Original file name |
| `fileSize` | Number | `8388608` | Bytes |
| `pdfKey` | String | `"uploads/3f6c….pdf"` | |
| `status` | String | `"PROCESSING"` | `PENDING_UPLOAD`, `PROCESSING`, `COMPLETED`, `FAILED` |
| `pageCount` | Number | `120` | Once known |
| `totalBlocks` | Number | `30` | Once known |
| `processedBlocks` | Number | `7` | Progress |
| `failedPages` | List\<Number\> | `[41, 42, 43, 44, 45]` | Pages from blocks that failed |
| `findingsCount` | Number | `12` | On completion |
| `relevantPages` | List\<Number\> | `[3, 14, 15, 88]` | Pages with high or medium relevance |
| `resultsKey` | String | `"results/3f6c….json"` | On completion |
| `errorMessage` | String | `"El PDF no contiene texto…"` | Only when `FAILED`. In Spanish, shown to the user |
| `inputTokens` | Number | | Cost tracking |
| `outputTokens` | Number | | Cost tracking |
| `startedAt` / `completedAt` | String (ISO 8601 UTC) | | |

### Global secondary index (GSI) `by-created-at`

| | Attribute |
|---|---|
| Partition key | `entityType` |
| Sort key | `createdAt` |
| Projection | `ALL` |

Usage: `list-jobs` runs a `Query` with `entityType = "JOB"`, `ScanIndexForward = false` (newest first), `Limit = 20` and `ExclusiveStartKey` for pagination.

### Results JSON `results/{id}.json`

```json
{
  "jobId": "3f6c…",
  "findings": [
    {
      "page": 14,
      "topic": "aranceles",
      "quote": "verbatim text from the document",
      "reason": "why it is relevant",
      "relevance": "high",
      "verification": "verified"
    }
  ]
}
```

`topic`, `quote` and `reason` are written by the AI in the document's language (Spanish).

Results live in S3 instead of DynamoDB because a DynamoDB item has a 400 KB limit (see ADR-0004).

### S3 buckets

| Bucket | Prefix | Contents | Retention | Access |
|---|---|---|---|---|
| `web` | — | Built frontend | Replaced on each deploy | CloudFront only (OAC) |
| `data` | `uploads/` | Uploaded PDFs | 30 days | Presigned URLs only |
| `data` | `results/` | Results JSON | Indefinite | Lambdas only |

Two buckets keep permissions and lifecycle rules separate: the deploy pipeline can overwrite the `web` bucket without any access to user data.

### CORS

The web app and the API share the same origin, so **API Gateway needs no CORS configuration**.

The browser still talks directly to the `data` bucket (presigned upload, and reading the PDF for the viewer), which is a different origin. That bucket's CORS allows only the CloudFront domain, with methods `POST` and `GET`.

## API contract

All routes live under `/api`. Every route requires `Authorization: Bearer <password>`. The `authorizer` validates it before the request reaches the handler:

- Missing header: API Gateway responds **401** without invoking any Lambda.
- Wrong password: the authorizer rejects it and API Gateway responds **403**.

The web app treats **401 and 403 the same way**: it deletes the stored password and returns to the login screen.

Handler errors respond with `{ "error": "<message in Spanish>" }`, so the web app can show it as is.

### `POST /api/jobs`

Request:
```json
{ "name": "Gaceta 4 nov", "query": "impuestos, aranceles", "fileName": "gaceta.pdf", "fileSize": 8388608, "pagesPerBlock": 5 }
```

`pagesPerBlock` is optional. If omitted, `5` is used. It must be a whole number ≥ 2.

Response `201`:
```json
{
  "job": { "id": "3f6c…", "status": "PENDING_UPLOAD", "...": "..." },
  "upload": { "url": "https://<data-bucket>.s3.amazonaws.com/", "fields": { "key": "uploads/3f6c….pdf", "...": "..." } }
}
```

Errors: `400` invalid input.

### `GET /api/jobs/{id}`

Response `200`:
```json
{
  "job": { "id": "3f6c…", "status": "COMPLETED", "processedBlocks": 30, "totalBlocks": 30, "...": "..." },
  "findings": [ { "page": 14, "...": "..." } ],
  "pdfUrl": "https://…"
}
```

- `findings` is only present when the status is `COMPLETED`.
- `pdfUrl` is a presigned read URL (15 min). It is `null` if the PDF was already deleted.

Errors: `404` job not found.

### `GET /api/jobs?cursor=<cursor>`

Response `200`:
```json
{
  "jobs": [ { "id": "…", "name": "…", "status": "COMPLETED", "createdAt": "…", "findingsCount": 12 } ],
  "nextCursor": "eyJpZCI6…"
}
```

`nextCursor` is `null` when there are no more pages. It is DynamoDB's `LastEvaluatedKey`, base64url-encoded.

### `GET /api/auth/check`

Used by the login screen (FR-01) to check the password. If the request reaches the handler, the authorizer has already approved it, so the handler just responds `204`. A wrong password is rejected earlier by the authorizer (`401`/`403`). The route is served by `list-jobs` to avoid a separate Lambda just for this.

## Configuration

| Environment variable | Lambda | Default |
|---|---|---|
| `TABLE_NAME` | create, analyze, get, list | — |
| `DATA_BUCKET_NAME` | create, analyze, get, list | — |
| `APP_PASSWORD_PARAM` | authorizer | `/gaceta-analyzer/app-password` |
| `DEEPSEEK_API_KEY_PARAM` | analyze | `/gaceta-analyzer/deepseek-api-key` |
| `DEEPSEEK_MODEL` | analyze | `deepseek-v4-flash` |
| `MAX_CONCURRENCY` | analyze | `5` |

The pages per block is not an environment variable: it comes from each job (see ADR-0012). The default (5) and the fixed overlap (1) are constants in `packages/shared`, so the web form and the API use the same values.

The web app needs no configuration: it calls the API with relative paths (`/api/...`). In local development, the Vite dev server proxies `/api` to the deployed API Gateway URL, set in `apps/web/.env.local` as `VITE_DEV_API_PROXY_TARGET`.

## Repository structure

```
gaceta-analyzer/
├── docs/
│   ├── README.md
│   ├── architecture.md
│   ├── requirements/
│   │   ├── functional.md
│   │   └── non-functional.md
│   └── adr/
├── apps/
│   ├── web/                        # React + Vite
│   │   └── src/
│   │       ├── pages/              # LoginPage, JobListPage, NewJobPage, JobDetailPage
│   │       ├── components/
│   │       └── api/                # typed HTTP client
│   └── api/
│       ├── src/
│       │   ├── handlers/
│       │   │   ├── authorizer.ts
│       │   │   ├── create-job.ts
│       │   │   ├── analyze-pdf.ts
│       │   │   ├── get-job.ts
│       │   │   └── list-jobs.ts
│       │   └── lib/
│       │       ├── password.ts          # constant-time comparison (used by authorizer.ts)
│       │       ├── config.ts            # environment variables and SSM
│       │       ├── jobs-repository.ts   # all DynamoDB access
│       │       ├── job-expiration.ts    # read-time expiration rules (1 h / 20 min)
│       │       ├── storage.ts           # S3 and presigned URLs
│       │       ├── pdf.ts               # text extraction
│       │       ├── blocks.ts            # block building
│       │       ├── ai-client.ts         # DeepSeek calls
│       │       ├── findings.ts          # verification and deduplication
│       │       ├── http.ts              # common HTTP responses
│       │       └── logger.ts
│       ├── tests/
│       └── build.mjs               # esbuild: one zip per handler
├── packages/
│   └── shared/                     # types, constants and API contract
├── infra/
│   ├── bootstrap/                  # Terraform state bucket and OIDC role
│   └── main/                       # everything else, including CloudFront and the web bucket
│       └── functions/
│           └── spa-rewrite.js      # CloudFront Function
├── .claude/
│   └── CLAUDE.md
├── .github/workflows/
│   ├── ci.yml
│   └── deploy.yml
├── package.json                    # npm workspaces
└── README.md
```
