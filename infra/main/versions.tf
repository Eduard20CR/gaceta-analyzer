# Terraform and provider versions for infra/main (ADR-0011).

terraform {
  # 1.10 is the first version with native S3 state locking (`use_lockfile` in
  # backend.tf). Any newer 1.x works.
  required_version = ">= 1.10"

  required_providers {
    aws = {
      source = "hashicorp/aws"
      # Same version as infra/bootstrap, so both folders behave the same way.
      version = "~> 6.72"
    }
  }
}
