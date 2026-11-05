provider "aws" {
  # The only region of the project (NFR-DEP-07).
  region = "us-east-1"

  # Added to every resource, so the project's resources are easy to find and to
  # group in the AWS bill.
  default_tags {
    tags = {
      Project   = "gaceta-analyzer"
      ManagedBy = "terraform"
    }
  }
}
