# What the GitHub deploy role may do.
#
# Why not AdministratorAccess? The role is used by every pull request's
# `terraform plan` and every merge's `terraform apply`. If a workflow or a
# dependency were ever compromised, admin access would expose the whole AWS
# account. Instead, each statement below allows one service that infra/main
# uses, and wherever AWS allows it, only resources named "gaceta-analyzer-*".
#
# The trade-off: when infra/main starts using a new AWS service, this file must be
# updated and the bootstrap applied again by hand (see README.md).
#
# What infra/main manages (docs/architecture.md):
#   S3 (web and data buckets), DynamoDB (jobs table), Lambda (five functions),
#   IAM (one role per Lambda), CloudWatch Logs, API Gateway (HTTP API),
#   CloudFront (distribution, OAC, CloudFront Function) and AWS Budgets.
#
# Note: the role can NOT read SSM parameters. Only the authorizer may read the
# password and only analyze-pdf the DeepSeek key (NFR-SEC-07). infra/main must
# build the parameter ARNs as strings instead of using `data "aws_ssm_parameter"`.

locals {
  # ARN patterns used several times below.
  prefixed_role_arn   = "arn:${local.partition}:iam::${local.account_id}:role/${local.name_prefix}-*"
  prefixed_policy_arn = "arn:${local.partition}:iam::${local.account_id}:policy/${local.name_prefix}-*"
}

resource "aws_iam_role_policy" "github_deploy" {
  name   = "${local.name_prefix}-deploy"
  role   = aws_iam_role.github_deploy.id
  policy = data.aws_iam_policy_document.github_deploy_permissions.json
}

data "aws_iam_policy_document" "github_deploy_permissions" {
  # Buckets: the Terraform state, the web bucket (files uploaded by deploy.yml)
  # and the data bucket. All three are named "gaceta-analyzer-*".
  statement {
    sid     = "S3ProjectBuckets"
    actions = ["s3:*"]
    resources = [
      "arn:${local.partition}:s3:::${local.name_prefix}-*",
      "arn:${local.partition}:s3:::${local.name_prefix}-*/*",
    ]
  }

  # The `jobs` table and its GSI (index ARNs are "table/<name>/index/<index>").
  statement {
    sid     = "DynamoDbProjectTables"
    actions = ["dynamodb:*"]
    resources = [
      "arn:${local.partition}:dynamodb:${local.region}:${local.account_id}:table/${local.name_prefix}-*",
    ]
  }

  # The five Lambda functions, their versions and permissions (S3 trigger,
  # API Gateway).
  statement {
    sid     = "LambdaProjectFunctions"
    actions = ["lambda:*"]
    resources = [
      "arn:${local.partition}:lambda:${local.region}:${local.account_id}:function:${local.name_prefix}-*",
    ]
  }

  # Log groups of the Lambdas and of API Gateway. Their names are fixed by AWS
  # ("/aws/lambda/<function>"), so the function name prefix still applies.
  statement {
    sid     = "LogsProjectLogGroups"
    actions = ["logs:*"]
    resources = [
      "arn:${local.partition}:logs:${local.region}:${local.account_id}:log-group:/aws/lambda/${local.name_prefix}-*",
      "arn:${local.partition}:logs:${local.region}:${local.account_id}:log-group:/aws/apigateway/${local.name_prefix}-*",
    ]
  }

  # Terraform lists log groups to read their state; listing cannot be scoped.
  statement {
    sid       = "LogsDescribe"
    actions   = ["logs:DescribeLogGroups"]
    resources = ["*"]
  }

  # API Gateway and CloudFront identify resources by generated ids, not by name,
  # so they cannot be scoped to the prefix. Both are limited to their own service.
  statement {
    sid     = "ApiGateway"
    actions = ["apigateway:*"]
    resources = [
      "arn:${local.partition}:apigateway:${local.region}::/*",
    ]
  }

  statement {
    sid       = "CloudFront"
    actions   = ["cloudfront:*"]
    resources = ["*"]
  }

  # The monthly budget alarm (NFR-COST-01).
  statement {
    sid     = "BudgetsProjectBudgets"
    actions = ["budgets:*"]
    resources = [
      "arn:${local.partition}:budgets::${local.account_id}:budget/${local.name_prefix}-*",
    ]
  }

  # The Lambda roles and their policies. Every role created this way MUST have the
  # Lambda permissions boundary (see below), otherwise the call is denied.
  statement {
    sid = "IamCreateRolesWithBoundary"
    actions = [
      "iam:CreateRole",
      "iam:PutRolePolicy",
      "iam:AttachRolePolicy",
      "iam:DetachRolePolicy",
      "iam:DeleteRolePolicy",
      "iam:PutRolePermissionsBoundary",
    ]
    resources = [local.prefixed_role_arn]

    condition {
      test     = "StringEquals"
      variable = "iam:PermissionsBoundary"
      values   = [aws_iam_policy.lambda_boundary.arn]
    }
  }

  # Changes that cannot add permissions beyond the boundary.
  statement {
    sid = "IamManageProjectRoles"
    actions = [
      "iam:DeleteRole",
      "iam:GetRole",
      "iam:GetRolePolicy",
      "iam:ListAttachedRolePolicies",
      "iam:ListInstanceProfilesForRole",
      "iam:ListRolePolicies",
      "iam:ListRoleTags",
      "iam:TagRole",
      "iam:UntagRole",
      "iam:UpdateAssumeRolePolicy",
      "iam:UpdateRole",
      "iam:UpdateRoleDescription",
    ]
    resources = [local.prefixed_role_arn]
  }

  statement {
    sid = "IamManageProjectPolicies"
    actions = [
      "iam:CreatePolicy",
      "iam:CreatePolicyVersion",
      "iam:DeletePolicy",
      "iam:DeletePolicyVersion",
      "iam:GetPolicy",
      "iam:GetPolicyVersion",
      "iam:ListPolicyVersions",
      "iam:TagPolicy",
      "iam:UntagPolicy",
    ]
    resources = [local.prefixed_policy_arn]
  }

  # Lambda needs to be given its role when the function is created or updated.
  statement {
    sid       = "IamPassRolesToLambda"
    actions   = ["iam:PassRole"]
    resources = [local.prefixed_role_arn]

    condition {
      test     = "StringEquals"
      variable = "iam:PassedToService"
      values   = ["lambda.amazonaws.com"]
    }
  }

  # The deploy role must never change itself or the boundary: that would let it
  # give itself (or a Lambda) more permissions. Both names match the prefix, so
  # an explicit Deny is needed. Deny always wins over Allow in IAM.
  statement {
    sid    = "DenyChangingTheBootstrap"
    effect = "Deny"
    not_actions = [
      "iam:GetRole",
      "iam:GetRolePolicy",
      "iam:GetPolicy",
      "iam:GetPolicyVersion",
      "iam:ListAttachedRolePolicies",
      "iam:ListRolePolicies",
      "iam:ListPolicyVersions",
    ]
    resources = [
      aws_iam_role.github_deploy.arn,
      aws_iam_policy.lambda_boundary.arn,
    ]
  }

  # The state bucket is protected by `prevent_destroy` in Terraform; this also
  # stops a workflow from deleting it with the AWS CLI.
  statement {
    sid       = "DenyDeletingTheStateBucket"
    effect    = "Deny"
    actions   = ["s3:DeleteBucket", "s3:PutBucketPolicy", "s3:DeleteBucketPolicy"]
    resources = [aws_s3_bucket.terraform_state.arn]
  }
}

# Permissions boundary for the Lambda roles that infra/main creates.
#
# A boundary is the maximum a role can ever do, whatever policies are attached
# to it. Without it, the deploy role could create a role with full access, give
# it to a Lambda and run code with those permissions. With it, a Lambda can at
# most do what the app needs (each role then grants only its own part,
# NFR-SEC-07).
resource "aws_iam_policy" "lambda_boundary" {
  name        = local.lambda_boundary_name
  description = "Maximum permissions of any Lambda role of gaceta-analyzer."
  policy      = data.aws_iam_policy_document.lambda_boundary.json
}

data "aws_iam_policy_document" "lambda_boundary" {
  statement {
    sid = "WriteOwnLogs"
    actions = [
      "logs:CreateLogGroup",
      "logs:CreateLogStream",
      "logs:PutLogEvents",
    ]
    resources = [
      "arn:${local.partition}:logs:${local.region}:${local.account_id}:log-group:/aws/lambda/${local.name_prefix}-*",
    ]
  }

  statement {
    sid     = "JobsTable"
    actions = ["dynamodb:*"]
    resources = [
      "arn:${local.partition}:dynamodb:${local.region}:${local.account_id}:table/${local.name_prefix}-*",
    ]
  }

  statement {
    sid     = "DataBucket"
    actions = ["s3:*"]
    resources = [
      "arn:${local.partition}:s3:::${local.name_prefix}-*",
      "arn:${local.partition}:s3:::${local.name_prefix}-*/*",
    ]
  }

  # The app password and the DeepSeek API key (NFR-SEC-02).
  statement {
    sid     = "ReadAppSecrets"
    actions = ["ssm:GetParameter"]
    resources = [
      "arn:${local.partition}:ssm:${local.region}:${local.account_id}:parameter/${local.name_prefix}/*",
    ]
  }

  # SecureString parameters are encrypted with the AWS-managed key "aws/ssm".
  # Decrypting is only allowed when the request comes through SSM.
  statement {
    sid       = "DecryptSecretsThroughSsm"
    actions   = ["kms:Decrypt"]
    resources = ["*"]

    condition {
      test     = "StringEquals"
      variable = "kms:ViaService"
      values   = ["ssm.${local.region}.amazonaws.com"]
    }
  }

  # Never allow touching the state bucket from a Lambda, even though its name has
  # the same prefix.
  statement {
    sid       = "DenyStateBucket"
    effect    = "Deny"
    actions   = ["s3:*"]
    resources = [aws_s3_bucket.terraform_state.arn, "${aws_s3_bucket.terraform_state.arn}/*"]
  }
}
