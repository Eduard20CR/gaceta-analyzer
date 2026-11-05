# S3 bucket that stores the Terraform state of infra/main (NFR-DEP-03).
# infra/main locks the state with a lock file in this same bucket
# (`use_lockfile = true`), so no DynamoDB lock table is needed (ADR-0011).

resource "aws_s3_bucket" "terraform_state" {
  bucket = local.state_bucket_name

  # Losing this bucket would make Terraform forget every resource of the app.
  # `terraform destroy` refuses to delete it; remove this line first on purpose.
  lifecycle {
    prevent_destroy = true
  }
}

# Versioning keeps every previous state file, so a broken state can be restored.
resource "aws_s3_bucket_versioning" "terraform_state" {
  bucket = aws_s3_bucket.terraform_state.id

  versioning_configuration {
    status = "Enabled"
  }
}

# The state can contain sensitive values, so it is encrypted at rest. AES256
# (S3-managed keys) costs nothing extra, unlike a customer-managed KMS key.
resource "aws_s3_bucket_server_side_encryption_configuration" "terraform_state" {
  bucket = aws_s3_bucket.terraform_state.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

# Nothing in this bucket may ever be public.
resource "aws_s3_bucket_public_access_block" "terraform_state" {
  bucket = aws_s3_bucket.terraform_state.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Old state versions are only needed for a while after a bad apply. Deleting them
# after 90 days keeps the bucket small without losing the recent history.
resource "aws_s3_bucket_lifecycle_configuration" "terraform_state" {
  bucket = aws_s3_bucket.terraform_state.id

  rule {
    id     = "expire-old-state-versions"
    status = "Enabled"

    filter {}

    noncurrent_version_expiration {
      noncurrent_days = 90
    }
  }

  # A lifecycle rule must be created after versioning is enabled.
  depends_on = [aws_s3_bucket_versioning.terraform_state]
}

# Only HTTPS requests are accepted.
resource "aws_s3_bucket_policy" "terraform_state" {
  bucket = aws_s3_bucket.terraform_state.id
  policy = data.aws_iam_policy_document.terraform_state_bucket.json

  # Applying a bucket policy while the public access block is still being created
  # can fail, so wait for it.
  depends_on = [aws_s3_bucket_public_access_block.terraform_state]
}

data "aws_iam_policy_document" "terraform_state_bucket" {
  statement {
    sid     = "DenyInsecureTransport"
    effect  = "Deny"
    actions = ["s3:*"]
    resources = [
      aws_s3_bucket.terraform_state.arn,
      "${aws_s3_bucket.terraform_state.arn}/*",
    ]

    principals {
      type        = "*"
      identifiers = ["*"]
    }

    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values   = ["false"]
    }
  }
}
