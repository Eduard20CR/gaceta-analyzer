data "aws_caller_identity" "current" {}

locals {
  account_id = data.aws_caller_identity.current.account_id

  # Every resource must be named with this prefix: the GitHub deploy role created
  # by infra/bootstrap is only allowed to manage resources whose names start with
  # it (infra/bootstrap/deploy-role-permissions.tf).
  name_prefix = "gaceta-analyzer"

  jobs_table_name = "${local.name_prefix}-jobs"

  # S3 bucket names are global across every AWS account in the world, so the
  # account id is added to make them unique.
  data_bucket_name = "${local.name_prefix}-data-${local.account_id}"
  web_bucket_name  = "${local.name_prefix}-web-${local.account_id}"

  # PDFs are deleted 30 days after they are uploaded (NFR-SEC-06).
  uploads_retention_days = 30
}
