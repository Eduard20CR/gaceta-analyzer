# Lets GitHub Actions get temporary AWS credentials through OIDC, so no AWS access
# keys are stored in GitHub (NFR-SEC-09).
#
# An AWS account can have only ONE OIDC provider for GitHub's URL, and every
# project in the account shares it. This account already has one (created by
# another project), so the bootstrap only looks it up instead of creating it.
# That way this project never owns, changes or deletes the shared provider; it
# only adds its own role, which trusts this repository alone (see below).
#
# If the account has no GitHub provider yet, create it once by hand (see the
# README, "Before you start") and then apply this folder.
data "aws_iam_openid_connect_provider" "github" {
  url = "https://${local.github_oidc_host}"
}

# The role the workflows assume: `terraform plan` on pull requests (ci.yml) and
# `terraform apply` plus the web upload on merges to main (deploy.yml).
resource "aws_iam_role" "github_deploy" {
  name                 = local.deploy_role_name
  description          = "Assumed by GitHub Actions of ${var.github_repository} to plan and deploy infra/main."
  assume_role_policy   = data.aws_iam_policy_document.github_deploy_trust.json
  max_session_duration = 3600
}

data "aws_iam_policy_document" "github_deploy_trust" {
  statement {
    sid     = "GitHubActionsOfThisRepository"
    effect  = "Allow"
    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type        = "Federated"
      identifiers = [data.aws_iam_openid_connect_provider.github.arn]
    }

    # The token must be meant for AWS STS.
    condition {
      test     = "StringEquals"
      variable = "${local.github_oidc_host}:aud"
      values   = [local.github_oidc_audience]
    }

    # Only two kinds of runs of this repository may assume the role:
    # - a workflow running on the main branch (deploy on merge), and
    # - a workflow running for a pull request (terraform plan in CI).
    #
    # StringEquals (not StringLike), so no other repository, branch or tag can
    # match by accident. Note: a job that sets `environment:` gets a different
    # subject ("<prefix>:environment:<name>") and would be rejected. The prefix
    # is explained in variables.tf (github_oidc_subject_prefix).
    condition {
      test     = "StringEquals"
      variable = "${local.github_oidc_host}:sub"
      values = [
        "${var.github_oidc_subject_prefix}:ref:refs/heads/main",
        "${var.github_oidc_subject_prefix}:pull_request",
      ]
    }
  }
}
