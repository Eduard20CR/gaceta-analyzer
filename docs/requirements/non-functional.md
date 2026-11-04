# Non-functional requirements

Each requirement has an ID (`NFR-<AREA>-XX`) and a verifiable criterion.

---

## Security (SEC)

| ID | Requirement | How it is verified |
|---|---|---|
| NFR-SEC-01 | Every API route requires the password in the `Authorization: Bearer <password>` header. It is validated by a **Lambda authorizer** configured as API Gateway's default authorizer, before reaching any handler. A missing header returns **401**; a wrong password returns **403**. The authorizer response is cached for 5 minutes. | Unit tests for the authorizer and a manual test with `curl`. |
| NFR-SEC-02 | The app password and the DeepSeek API key are stored in **SSM Parameter Store** as `SecureString`. They never appear in code, in the repository, in plain-text Terraform variables or in logs. | Code review; repository search. |
| NFR-SEC-03 | The password comparison runs in constant time (`crypto.timingSafeEqual`). | Code review. |
| NFR-SEC-04 | Both S3 buckets are **private**, with public access block enabled. The `web` bucket is only readable by CloudFront through Origin Access Control. The `data` bucket is only accessed by the Lambdas and through presigned URLs that expire after **15 minutes**. | Terraform configuration. |
| NFR-SEC-05 | The web app and the API are served from the same CloudFront URL, so the API has **no CORS**. The `data` bucket's CORS only allows the CloudFront domain (and `http://localhost:5173` for development), with methods `POST` and `GET`. | Terraform configuration. |
| NFR-SEC-06 | PDFs are automatically deleted from S3 after **30 days** (lifecycle rule). Results are kept. | Terraform configuration. |
| NFR-SEC-07 | Each Lambda has its own IAM role with **least privilege**: only the actions and resources it needs. Only the `authorizer` can read the password in SSM, and only `analyze-pdf` can read the DeepSeek API key. | Terraform review. |
| NFR-SEC-08 | The presigned upload URL only accepts `application/pdf` and a maximum size of **100 MB**. | Manual test uploading a larger file. |
| NFR-SEC-09 | GitHub Actions authenticates with AWS through **OIDC**. No AWS access keys are stored in GitHub. | Workflow configuration. |
| NFR-SEC-10 | Data always travels over HTTPS. S3 and DynamoDB use encryption at rest (AWS default). | Configuration. |

**Confidentiality notice:** the PDF text is sent to DeepSeek. Before using the application with internal documents, confirm that the workplace policy allows it. La Gaceta documents are public.

---

## Cost (COST)

| ID | Requirement | How it is verified |
|---|---|---|
| NFR-COST-01 | An **AWS Budgets** alarm sends an email at 80% of **USD 10 per month**. | Terraform configuration. |
| NFR-COST-02 | A spending limit is set manually in the DeepSeek account. | Manual step documented in the README. |
| NFR-COST-03 | DynamoDB in **on-demand** capacity mode (pay per request). | Terraform configuration. |
| NFR-COST-04 | CloudWatch logs are retained for **14 days**. | Terraform configuration. |
| NFR-COST-05 | Limit per analysis: 100 MB (see FR-02). No page limit. The token usage of each analysis is recorded (NFR-OBS-02). | Tests. |
| NFR-COST-06 | The system instructions sent to the AI are identical in every call, to benefit from DeepSeek's prompt cache. | Code review. |

---

## Performance (PERF)

| ID | Requirement | How it is verified |
|---|---|---|
| NFR-PERF-01 | A **120-page** PDF is analyzed in under **3 minutes**, and a **500-page** PDF in under **8 minutes**. | Manual test with real PDFs. |
| NFR-PERF-02 | Blocks are processed in parallel, with at most **5** concurrent AI calls (configurable). | Code review. |
| NFR-PERF-03 | Read routes (`GET`) respond in under **1 second** (excluding cold starts). | Manual test. |

---

## Reliability (REL)

| ID | Requirement | How it is verified |
|---|---|---|
| NFR-REL-01 | Each AI call is retried up to **3 times** with increasing delay (2 s, 4 s, 8 s). | Unit test with a mocked client. |
| NFR-REL-02 | Processing is **idempotent**: if S3 delivers the same event twice, the second one is ignored once the job is no longer `PENDING_UPLOAD`. | Unit test. |
| NFR-REL-03 | Any unhandled error during analysis leaves the job as `FAILED` with a readable message, never stuck in `PROCESSING`. | Unit test. |
| NFR-REL-04 | The AI response is validated against a schema. Findings with an invalid shape are discarded and a warning is logged, without breaking the analysis. | Unit test. |
| NFR-REL-05 | The analysis Lambda has a **15-minute** timeout (the Lambda maximum) and **3008 MB** of memory, so it can open PDFs up to 100 MB. | Terraform configuration and a test with the largest available PDF. |

---

## Maintainability (MAINT)

| ID | Requirement | How it is verified |
|---|---|---|
| NFR-MAINT-01 | All code in **TypeScript** with `strict: true`. | `tsc --noEmit` in CI. |
| NFR-MAINT-02 | Code, comments and documentation in **English**. Only user-facing UI text is in Spanish. | Code review. |
| NFR-MAINT-03 | A junior developer must be able to read the code: short functions with descriptive names, no clever one-liners, comments where the intent is not obvious. | Code review. |
| NFR-MAINT-04 | **Vitest** tests for the analysis logic: block building, quote verification, deduplication, AI response validation and the authorizer. | `npm test` in CI. |
| NFR-MAINT-05 | ESLint and Prettier configured; CI fails on errors. | CI. |
| NFR-MAINT-06 | Types shared between the web app and the API live in `packages/shared`. | Repository structure. |
| NFR-MAINT-07 | Every relevant architecture decision has an ADR in `docs/adr/`. | Review. |

---

## Observability (OBS)

| ID | Requirement | How it is verified |
|---|---|---|
| NFR-OBS-01 | Logs in **JSON** format with at least: level, message and `jobId` when available. | CloudWatch log review. |
| NFR-OBS-02 | When an analysis finishes, it logs: pages, blocks, failed blocks, findings, input and output tokens, and duration. | Log review. |
| NFR-OBS-03 | The PDF text, the password and the API key are never logged. | Code review. |

---

## Deployment (DEP)

| ID | Requirement | How it is verified |
|---|---|---|
| NFR-DEP-01 | All AWS infrastructure is defined with **Terraform** in `infra/`. | Review. |
| NFR-DEP-02 | There is a single environment (**main**). | `infra/` structure. |
| NFR-DEP-03 | Terraform state is stored in an S3 bucket created by `infra/bootstrap`. | Backend configuration. |
| NFR-DEP-04 | Every PR runs lint, typecheck, tests and `terraform plan`. | `ci.yml` workflow. |
| NFR-DEP-05 | Every merge to `main` builds the Lambdas, runs `terraform apply`, builds the web app, uploads it to the `web` bucket and invalidates `/index.html` in CloudFront. | `deploy.yml` workflow. |
| NFR-DEP-06 | The frontend and the API are served from **one CloudFront URL**: `/api/*` goes to API Gateway and everything else to the `web` bucket. | Terraform configuration. |
| NFR-DEP-07 | AWS region: **us-east-1**. | Terraform configuration. |

---

## Compatibility and usability (UX)

| ID | Requirement | How it is verified |
|---|---|---|
| NFR-UX-01 | Works on the latest versions of Chrome, Edge, Safari and Firefox. | Manual test. |
| NFR-UX-02 | Usable on desktop; on mobile it must render without breaking (not a priority). | Manual test. |
| NFR-UX-03 | The user interface is in **Spanish**. | Review. |
| NFR-UX-04 | Every error shown to the user is in Spanish and explains what to do. | Review. |
