# Terraform and provider versions for the bootstrap (ADR-0011).
#
# This configuration is applied once, by hand, from the owner's computer. Its state
# stays local (terraform.tfstate, git-ignored): it cannot live in the state bucket,
# because this configuration is what creates that bucket.

terraform {
  # 1.10 is the first version with native S3 state locking (`use_lockfile`), which
  # infra/main needs (ADR-0011). Any newer 1.x works.
  required_version = ">= 1.10"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.72"
    }
  }
}

provider "aws" {
  # The only region of the project (NFR-DEP-07).
  region = "us-east-1"

  # Added to every resource, so the project's resources are easy to find and to
  # group in the AWS bill.
  default_tags {
    tags = {
      Project   = "gaceta-analyzer"
      ManagedBy = "terraform-bootstrap"
    }
  }
}
