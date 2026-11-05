variable "github_repository" {
  description = "GitHub repository allowed to assume the deploy role, as \"owner/name\". It must match the case GitHub uses in its OIDC tokens."
  type        = string
  default     = "Eduard20CR/gaceta-analyzer"

  validation {
    condition     = can(regex("^[A-Za-z0-9-]+/[A-Za-z0-9._-]+$", var.github_repository))
    error_message = "Use the form \"owner/name\", for example \"Eduard20CR/gaceta-analyzer\"."
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
