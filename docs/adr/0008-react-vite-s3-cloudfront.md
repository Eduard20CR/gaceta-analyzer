# ADR-0008 — React frontend on S3 + CloudFront, sharing one URL with the API

- **Status:** Proposed
- **Date:** 2026-11-04

## Context

The frontend is a small four-screen application (login, history, new analysis, detail). The API runs on API Gateway. The goal is to keep all infrastructure in AWS and in Terraform, and to serve the web app and the API from the same URL.

## Decision

- **React + Vite + TypeScript**, with **React Router** for navigation and **TanStack Query** for API calls and status polling.
- The built files go to a private S3 bucket (`web`), separate from the `data` bucket.
- A **CloudFront distribution** with two origins:
  - Default behavior `/*` → `web` bucket through **Origin Access Control (OAC)**, with caching.
  - Behavior `/api/*` → **API Gateway**, with caching disabled and every viewer header forwarded except `Host`, so `Authorization` reaches the authorizer.
- API Gateway routes include the `/api` prefix.
- SPA routes (for example `/jobs/3f6c…`) are rewritten to `/index.html` by a **CloudFront Function** in the default behavior.
- The web app calls the API with relative paths (`/api/...`), so it needs no environment-specific configuration.
- `deploy.yml` builds the web app, uploads it with `aws s3 sync` and invalidates `/index.html`.
- The default `*.cloudfront.net` domain is used. A custom domain can be added later.

## Alternatives considered

- **Netlify:** simpler to set up and with automatic PR previews, but the frontend would live outside AWS and Terraform, and the API would be on a different origin (requiring CORS).
- **S3 static website hosting without CloudFront:** no HTTPS on the S3 website endpoint, and the bucket would have to be public.
- **Separate URLs for web and API:** works, but requires CORS on API Gateway and an API URL configured per environment.
- **Custom error responses (403/404 → `index.html`) for SPA routing:** the common recipe, but they apply to the whole distribution, so the API's real 403 and 404 responses would also be replaced by the HTML page. Rejected in favor of the CloudFront Function.

## Consequences

- **One URL** for everything, and **no CORS on the API**: browser requests to `/api/*` are same-origin.
- The `data` bucket still needs CORS (allowing only the CloudFront domain) because the browser uploads and reads PDFs there directly with presigned URLs.
- All infrastructure, including the frontend, is in Terraform.
- No automatic PR previews. Frontend changes are tested locally with the Vite dev server, which proxies `/api` to the deployed API Gateway.
- CloudFront propagates configuration changes in a few minutes, so infrastructure changes to the distribution are slower to apply than Lambda changes.
- `index.html` is served with `Cache-Control: no-cache` and hashed assets as immutable, so a deploy only needs to invalidate `/index.html`.
- CloudFront's free tier covers this project's traffic by a wide margin.
