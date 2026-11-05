# Lets GitHub Actions get temporary AWS credentials through OIDC, so no AWS access
# keys are stored in GitHub (NFR-SEC-09).

resource "aws_iam_openid_connect_provider" "github" {
  url            = "https://${local.github_oidc_host}"
  client_id_list = [local.github_oidc_audience]

  # No thumbprint_list: AWS validates GitHub's certificate with its own list of
  # trusted root authorities, so a pinned thumbprint is no longer needed.
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
      identifiers = [aws_iam_openid_connect_provider.github.arn]
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
    # subject ("repo:<repo>:environment:<name>") and would be rejected.
    condition {
      test     = "StringEquals"
      variable = "${local.github_oidc_host}:sub"
      values = [
        "repo:${var.github_repository}:ref:refs/heads/main",
        "repo:${var.github_repository}:pull_request",
      ]
    }
  }
}
