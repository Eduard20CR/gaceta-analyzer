data "aws_caller_identity" "current" {}

data "aws_partition" "current" {}

locals {
  account_id = data.aws_caller_identity.current.account_id
  partition  = data.aws_partition.current.partition
  region     = "us-east-1"

  # Every resource in infra/main must be named with this prefix. The deploy role's
  # permissions are scoped to it, so a typo in a name fails at plan/apply time
  # instead of touching something else in the account.
  name_prefix = "gaceta-analyzer"

  state_bucket_name = (
    var.state_bucket_name != ""
    ? var.state_bucket_name
    : "${local.name_prefix}-tfstate-${local.account_id}"
  )

  deploy_role_name     = "${local.name_prefix}-github-deploy"
  lambda_boundary_name = "${local.name_prefix}-lambda-boundary"
  github_oidc_host     = "token.actions.githubusercontent.com"
  github_oidc_audience = "sts.amazonaws.com"
}
