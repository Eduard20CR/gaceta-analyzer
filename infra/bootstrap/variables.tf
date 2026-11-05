variable "github_repository" {
  description = "GitHub repository allowed to assume the deploy role, as \"owner/name\". It must match the case GitHub uses in its OIDC tokens."
  type        = string
  default     = "Eduard20CR/gaceta-analyzer"

  validation {
    condition     = can(regex("^[A-Za-z0-9-]+/[A-Za-z0-9._-]+$", var.github_repository))
    error_message = "Use the form \"owner/name\", for example \"Eduard20CR/gaceta-analyzer\"."
  }
}

# How GitHub names this repository inside its OIDC tokens (the "sub" claim).
#
# This repository uses GitHub's "immutable subject" format, which adds the
# numeric ids of the owner and the repository to the name:
#   repo:Eduard20CR@41557299/gaceta-analyzer@1446229865:pull_request
# The ids never change, so a repository created later with the same name (for
# example after a rename or a delete) can never match. They are not secrets.
#
# To see the prefix GitHub uses, run (field `sub_claim_prefix`):
#   gh api repos/<owner>/<name>/actions/oidc/customization/sub
variable "github_oidc_subject_prefix" {
  description = "Start of the OIDC \"sub\" claim of this repository, as `sub_claim_prefix` shows it, for example \"repo:Eduard20CR@41557299/gaceta-analyzer@1446229865\"."
  type        = string
  default     = "repo:Eduard20CR@41557299/gaceta-analyzer@1446229865"

  validation {
    condition     = startswith(var.github_oidc_subject_prefix, "repo:")
    error_message = "The prefix starts with \"repo:\", for example \"repo:Eduard20CR@41557299/gaceta-analyzer@1446229865\"."
  }
}

variable "state_bucket_name" {
  description = "Name of the S3 bucket for the Terraform state of infra/main. Leave empty to use \"gaceta-analyzer-tfstate-<account id>\" (bucket names are global, so the account id makes it unique). It must start with \"gaceta-analyzer-\", the prefix the deploy role is allowed to manage."
  type        = string
  default     = ""

  validation {
    condition     = var.state_bucket_name == "" || startswith(var.state_bucket_name, "gaceta-analyzer-")
    error_message = "The state bucket name must start with \"gaceta-analyzer-\"."
  }
}
