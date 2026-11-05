# One IAM role per Lambda, each allowed only what its handler does (NFR-SEC-07).
#
# A role is like a badge: the function wears it, and the badge lists the doors it
# opens. Each Lambda gets its own badge so that, for example, a bug in get-job can
# never read the DeepSeek key.
#
# Every role also has the permissions boundary from infra/bootstrap: a ceiling
# that no policy here can go above, and without which the deploy role is not
# allowed to create the role at all.

locals {
  jobs_table_arn = aws_dynamodb_table.jobs.arn
  # The GSI used by list-jobs (lib/jobs-repository.ts → JOBS_BY_CREATED_AT_INDEX).
  jobs_index_arn = "${aws_dynamodb_table.jobs.arn}/index/by-created-at"

  uploads_objects_arn = "${aws_s3_bucket.data.arn}/uploads/*"
  results_objects_arn = "${aws_s3_bucket.data.arn}/results/*"
}

# Who may wear the roles: only the Lambda service.
data "aws_iam_policy_document" "lambda_assume_role" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "lambda" {
  for_each = local.lambdas

  # For example "gaceta-analyzer-create-job". The deploy role may only create
  # roles named with the project prefix.
  name                 = "${local.name_prefix}-${each.key}"
  assume_role_policy   = data.aws_iam_policy_document.lambda_assume_role.json
  permissions_boundary = local.lambda_permissions_boundary_arn
}

# The role's only policy. Each function's statements are in its own policy
# document below; `lambda_policies` picks the right one by name.
resource "aws_iam_role_policy" "lambda" {
  for_each = local.lambdas

  name   = "${local.name_prefix}-${each.key}"
  role   = aws_iam_role.lambda[each.key].id
  policy = local.lambda_policies[each.key]
}

locals {
  lambda_policies = {
    authorizer  = data.aws_iam_policy_document.authorizer.json
    create-job  = data.aws_iam_policy_document.create_job.json
    analyze-pdf = data.aws_iam_policy_document.analyze_pdf.json
    get-job     = data.aws_iam_policy_document.get_job.json
    list-jobs   = data.aws_iam_policy_document.list_jobs.json
  }
}

# Every function writes to its own log group, and only to that one. The log
# group itself is created by Terraform (lambdas.tf), so no function needs
# `logs:CreateLogGroup`. Each document below adds this one with
# `source_policy_documents`.
data "aws_iam_policy_document" "lambda_logs" {
  for_each = local.lambdas

  statement {
    sid       = "WriteOwnLogs"
    actions   = ["logs:CreateLogStream", "logs:PutLogEvents"]
    resources = ["${aws_cloudwatch_log_group.lambda[each.key].arn}:*"]
  }
}

# SecureString parameters are encrypted with the AWS-managed key "aws/ssm". Its
# id is different in each account and the deploy role cannot look it up, so this
# is the one place where the resource is "*". The condition only allows
# decrypting through SSM, and SSM only returns the parameter the role may read
# (NFR-SEC-02). Used by the two Lambdas that read a secret.
data "aws_iam_policy_document" "decrypt_through_ssm" {
  statement {
    sid       = "DecryptSecretThroughSsm"
    actions   = ["kms:Decrypt"]
    resources = ["*"]

    condition {
      test     = "StringEquals"
      variable = "kms:ViaService"
      values   = ["ssm.${local.region}.amazonaws.com"]
    }
  }
}

# The statements below match the AWS calls each handler makes
# (apps/api/src/lib/jobs-repository.ts and storage.ts).

# authorizer: only reads the app password (ADR-0006).
data "aws_iam_policy_document" "authorizer" {
  source_policy_documents = [
    data.aws_iam_policy_document.lambda_logs["authorizer"].json,
    data.aws_iam_policy_document.decrypt_through_ssm.json,
  ]

  statement {
    sid       = "ReadAppPassword"
    actions   = ["ssm:GetParameter"]
    resources = [local.app_password_param_arn]
  }
}

# create-job: creates the job and signs the presigned POST for uploads/<id>.pdf.
# A presigned POST only works if the signer could upload the object itself.
data "aws_iam_policy_document" "create_job" {
  source_policy_documents = [data.aws_iam_policy_document.lambda_logs["create-job"].json]

  statement {
    sid       = "CreateJob"
    actions   = ["dynamodb:PutItem"]
    resources = [local.jobs_table_arn]
  }

  statement {
    sid       = "SignPdfUpload"
    actions   = ["s3:PutObject"]
    resources = [local.uploads_objects_arn]
  }
}

# analyze-pdf: reads and updates the job, reads the PDF, writes the results and
# reads the DeepSeek key.
data "aws_iam_policy_document" "analyze_pdf" {
  source_policy_documents = [
    data.aws_iam_policy_document.lambda_logs["analyze-pdf"].json,
    data.aws_iam_policy_document.decrypt_through_ssm.json,
  ]

  statement {
    sid       = "ReadAndUpdateJob"
    actions   = ["dynamodb:GetItem", "dynamodb:UpdateItem"]
    resources = [local.jobs_table_arn]
  }

  statement {
    sid       = "ReadUploadedPdf"
    actions   = ["s3:GetObject"]
    resources = [local.uploads_objects_arn]
  }

  statement {
    sid       = "WriteResults"
    actions   = ["s3:PutObject"]
    resources = [local.results_objects_arn]
  }

  statement {
    sid       = "ReadDeepSeekApiKey"
    actions   = ["ssm:GetParameter"]
    resources = [local.deepseek_api_key_param_arn]
  }
}

# get-job: reads the job and its results, and signs the GET URL of the PDF.
data "aws_iam_policy_document" "get_job" {
  source_policy_documents = [data.aws_iam_policy_document.lambda_logs["get-job"].json]

  statement {
    sid       = "ReadJob"
    actions   = ["dynamodb:GetItem"]
    resources = [local.jobs_table_arn]
  }

  statement {
    sid       = "ReadResultsAndPdf"
    actions   = ["s3:GetObject"]
    resources = [local.results_objects_arn, local.uploads_objects_arn]
  }

  # Without ListBucket, S3 answers 403 instead of 404 for an object that does
  # not exist. get-job needs the 404 to know the PDF was deleted by the 30-day
  # rule (NFR-SEC-06) and return `pdfUrl: null`.
  statement {
    sid       = "TellMissingPdfApart"
    actions   = ["s3:ListBucket"]
    resources = [aws_s3_bucket.data.arn]
  }
}

# list-jobs: reads the history through the GSI. The same Lambda answers
# GET /api/auth/check, which needs no AWS access.
data "aws_iam_policy_document" "list_jobs" {
  source_policy_documents = [data.aws_iam_policy_document.lambda_logs["list-jobs"].json]

  statement {
    sid       = "ListJobsByDate"
    actions   = ["dynamodb:Query"]
    resources = [local.jobs_index_arn]
  }
}
