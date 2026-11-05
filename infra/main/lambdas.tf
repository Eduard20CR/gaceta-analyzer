# The five Lambda functions (ADR-0002, docs/architecture.md → "Components").
#
# Each function runs one zip written by apps/api/build.mjs (#25). Build them
# before any `terraform validate`, `plan` or `apply`:
#
#   npm run build:api
#
# The functions are described once in `local.lambdas` and created with
# `for_each`, so the five definitions cannot drift apart by accident. Their IAM
# roles are in iam.tf.

locals {
  # Folder with the zips, relative to this folder (infra/main).
  lambda_dist_dir = "${path.module}/../../apps/api/dist"

  # Environment variables shared by the four Lambdas that use the table and the
  # bucket (docs/architecture.md → "Configuration").
  data_environment = {
    TABLE_NAME       = aws_dynamodb_table.jobs.name
    DATA_BUCKET_NAME = aws_s3_bucket.data.id
  }

  # Added to every function: stack traces in CloudWatch point at the original
  # .ts lines, using the source map inside each zip.
  common_environment = {
    NODE_OPTIONS = "--enable-source-maps"
  }

  # One entry per Lambda. The key is the logical name: it matches the handler
  # file in apps/api/src/handlers/ and the zip in apps/api/dist/.
  #
  # Memory and timeout: analyze-pdf reads a whole PDF (500+ pages) and calls the
  # AI for many blocks, so it gets the maximum Lambda timeout and enough memory
  # for the PDF and the parallel calls (NFR-REL-05). In Lambda, more memory also
  # means more CPU, which makes text extraction faster. The other four only read
  # or write one DynamoDB item or a small S3 object, so 256 MB and 10 seconds are
  # plenty.
  lambdas = {
    authorizer = {
      memory_size = 256
      timeout     = 10
      environment = {
        APP_PASSWORD_PARAM = local.app_password_param
      }
    }

    create-job = {
      memory_size = 256
      timeout     = 10
      environment = local.data_environment
    }

    analyze-pdf = {
      memory_size = 3008
      timeout     = 900 # 15 minutes, the maximum Lambda allows
      environment = merge(local.data_environment, {
        DEEPSEEK_API_KEY_PARAM = local.deepseek_api_key_param
        DEEPSEEK_MODEL         = "deepseek-v4-flash"
        MAX_CONCURRENCY        = "5"
      })
    }

    get-job = {
      memory_size = 256
      timeout     = 10
      environment = local.data_environment
    }

    list-jobs = {
      memory_size = 256
      timeout     = 10
      environment = local.data_environment
    }
  }
}

# Log groups, created by Terraform instead of letting Lambda create them on the
# first run. That way they get a 14-day retention (NFR-COST-04) and are deleted
# with the functions. The name is fixed by AWS: /aws/lambda/<function name>.
resource "aws_cloudwatch_log_group" "lambda" {
  for_each = local.lambdas

  name              = "/aws/lambda/${local.name_prefix}-${each.key}"
  retention_in_days = 14
}

resource "aws_lambda_function" "this" {
  for_each = local.lambdas

  # For example "gaceta-analyzer-create-job". The deploy role can only manage
  # functions with the project prefix.
  function_name = "${local.name_prefix}-${each.key}"
  role          = aws_iam_role.lambda[each.key].arn

  filename = "${local.lambda_dist_dir}/${each.key}.zip"
  # The hash of the zip: when the code changes, the hash changes and Terraform
  # uploads the new zip. build.mjs makes the zip depend only on the code, so an
  # unchanged handler does not cause a redeploy.
  source_code_hash = filebase64sha256("${local.lambda_dist_dir}/${each.key}.zip")

  # build.mjs writes index.mjs, which exports `handler`.
  handler       = "index.handler"
  runtime       = "nodejs24.x"
  architectures = ["arm64"] # Graviton: cheaper than x86 for the same work

  memory_size = each.value.memory_size
  timeout     = each.value.timeout

  environment {
    variables = merge(local.common_environment, each.value.environment)
  }

  # The app already writes one JSON object per line (lib/logger.ts), so the
  # "Text" format keeps those lines as they are instead of wrapping them in
  # another JSON object. Naming the log group makes the link explicit.
  logging_config {
    log_format = "Text"
    log_group  = aws_cloudwatch_log_group.lambda[each.key].name
  }

  # Possible cost guard, not needed for now: `reserved_concurrent_executions` on
  # analyze-pdf would cap how many PDFs are analyzed at the same time.

  # The role's policy must exist before the function runs for the first time,
  # or the first invocation could fail with "access denied".
  depends_on = [aws_iam_role_policy.lambda]
}

# ---------------------------------------------------------------------------
# S3 trigger: a PDF landing in uploads/ starts analyze-pdf (ADR-0005)
# ---------------------------------------------------------------------------

# Lets the data bucket (and only that bucket, in this account) invoke analyze-pdf.
resource "aws_lambda_permission" "s3_invoke_analyze_pdf" {
  statement_id   = "AllowInvokeFromDataBucket"
  action         = "lambda:InvokeFunction"
  function_name  = aws_lambda_function.this["analyze-pdf"].function_name
  principal      = "s3.amazonaws.com"
  source_arn     = aws_s3_bucket.data.arn
  source_account = local.account_id
}

resource "aws_s3_bucket_notification" "data" {
  bucket = aws_s3_bucket.data.id

  lambda_function {
    lambda_function_arn = aws_lambda_function.this["analyze-pdf"].arn
    events              = ["s3:ObjectCreated:*"]

    # Only uploaded PDFs. Writing results/<id>.json must never start an analysis.
    filter_prefix = "uploads/"
    filter_suffix = ".pdf"
  }

  # S3 checks that it may invoke the function when the notification is saved.
  depends_on = [aws_lambda_permission.s3_invoke_analyze_pdf]
}
