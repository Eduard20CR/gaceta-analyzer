data "aws_caller_identity" "current" {}

data "aws_partition" "current" {}

locals {
  account_id = data.aws_caller_identity.current.account_id
  partition  = data.aws_partition.current.partition

  # The only region of the project (NFR-DEP-07), same as providers.tf.
  region = "us-east-1"

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

  # Permissions boundary created by infra/bootstrap. Every Lambda role must use it,
  # or the deploy role is not allowed to create the role. The ARN is built as a
  # string because it always has this shape and the bootstrap's state is local
  # (ADR-0011), so infra/main cannot read its outputs.
  lambda_permissions_boundary_arn = "arn:${local.partition}:iam::${local.account_id}:policy/${local.name_prefix}-lambda-boundary"

  # SSM parameters with the secrets (NFR-SEC-02). They are created by hand
  # (issue #28), never by Terraform. Only the names are used here: the deploy
  # role cannot read SSM, so the ARNs are built as strings below.
  app_password_param     = "/${local.name_prefix}/app-password"
  deepseek_api_key_param = "/${local.name_prefix}/deepseek-api-key"

  # A parameter ARN is "...:parameter" followed by the name, which already
  # starts with "/".
  ssm_parameter_arn_prefix   = "arn:${local.partition}:ssm:${local.region}:${local.account_id}:parameter"
  app_password_param_arn     = "${local.ssm_parameter_arn_prefix}${local.app_password_param}"
  deepseek_api_key_param_arn = "${local.ssm_parameter_arn_prefix}${local.deepseek_api_key_param}"
}
