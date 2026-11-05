# ADR-0011 — Single environment with Terraform and a separate bootstrap

- **Status:** Proposed
- **Date:** 2026-11-04

## Context

This is a small, single-user project. Maintaining development and production environments doubles resources and deployment steps. Terraform needs a place to store its state before it can create the rest of the infrastructure.

## Decision

- A single environment: **main**, in region **us-east-1**.
- `infra/bootstrap/`: applied **once, manually**, with local state. It creates:
  - The S3 bucket for Terraform state (versioned and encrypted).
  - The IAM role GitHub Actions assumes, trusted only by this repository.
- The GitHub OIDC provider (`token.actions.githubusercontent.com`) is **not** created by the bootstrap. An AWS account can have only one provider per URL, and the account already has one shared with other projects. The bootstrap looks it up with a data source, so this project never owns or deletes it. If the account has none, it is created once by hand (see `infra/bootstrap/README.md`).
- `infra/main/`: all application infrastructure. Its state lives in the bootstrap bucket, with native S3 locking (`use_lockfile = true`, Terraform 1.10 or later), with no DynamoDB lock table.
- GitHub Actions runs `terraform plan` on every PR and `terraform apply` on every merge to `main`.

## Alternatives considered

- **Dev and prod environments:** safer for testing changes, but doubles the work for little benefit in this project.
- **Terraform Cloud for state:** another account and service to configure.
- **AWS access keys in GitHub secrets:** rejected for security; OIDC issues temporary credentials.

## Consequences

- Changes are tested locally first (Vitest) and then directly in the single environment.
- A bad `terraform apply` directly affects the application in use. Always review the `plan` in the PR before merging.
- This project depends on a shared OIDC provider it does not manage. Deleting it from another project breaks deploys here until it is created again.
- The bootstrap's local state stays on the machine of whoever applied it. It is not committed. Since the bootstrap rarely changes, this is acceptable.
