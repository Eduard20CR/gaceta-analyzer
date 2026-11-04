# ADR-0006 — Shared password validated by a Lambda authorizer

- **Status:** Proposed
- **Date:** 2026-11-04

## Context

The application has a single user, but the web app and the API are public on the internet. Without protection, anyone who discovers the URL could upload PDFs and drain the DeepSeek balance.

If each API Lambda validates the password on its own, forgetting that check in a new Lambda leaves a route open. Also, every Lambda would need permission to read the password from SSM.

## Decision

- A single password stored in SSM Parameter Store (`SecureString`).
- The web app asks for it once and stores it in `localStorage`.
- Every request sends it in `Authorization: Bearer <password>`.
- A **Lambda authorizer** (`authorizer`) attached to API Gateway validates the password **before** the request reaches any handler:
  - It is applied to **every route** as the API's default authorizer.
  - It uses the HTTP API **simple response** format (`{ isAuthorized: true | false }`).
  - It compares the password with the SSM value in constant time (`crypto.timingSafeEqual`).
  - It keeps the SSM value in memory across invocations to avoid reading it on every request.
- API Gateway **caches** the authorizer response for **5 minutes**, keyed on the `Authorization` header. If the header is missing, API Gateway responds 401 without invoking any Lambda.
- Only the `authorizer` has IAM permission to read the password from SSM. Handlers know nothing about authentication.

## Alternatives considered

- **Validate inside each handler:** works just as well if done everywhere, but relies on never forgetting it, and requires SSM access for every Lambda.
- **Amazon Cognito with a JWT authorizer:** the complete solution (users, expiring tokens, password recovery). Too much for one user.
- **HTTP Basic Auth in a CloudFront Function:** would protect the web app and the API at once, since they share a domain. Rejected because the password would live in the function code (CloudFront Functions cannot read SSM) and the browser's native login prompt is a poor experience.
- **No authentication, secret URL only:** too fragile.

## Consequences

- **Authentication lives in one place.** A new route is protected automatically.
- Unauthorized requests are rejected before any handler runs, so they never touch DynamoDB or S3.
- Least privilege: only one Lambda can read the password.
- One extra Lambda. Thanks to the 5-minute cache, it adds almost no latency or cost.
- Because of that cache, after changing the password in SSM, the old one may keep working for up to 5 minutes.
- The password travels with every request. This is acceptable because everything goes over HTTPS.
- Storing it in `localStorage` exposes it to XSS attacks. The risk is low because the web app does not render third-party content as HTML.
- No expiration and no lockout after failed attempts.
- If the application ever has multiple users, migrate to Cognito with a JWT authorizer. Handlers do not change.
