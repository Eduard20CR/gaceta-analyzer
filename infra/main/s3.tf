# S3 buckets (docs/architecture.md → "S3 buckets", ADR-0004, ADR-0008).
#
# - `data`: uploaded PDFs (`uploads/`) and results (`results/`).
# - `web`: the built frontend, served by CloudFront (cloudfront.tf).
#
# Two buckets keep permissions and lifecycle rules separate: the deploy pipeline
# can overwrite the `web` bucket without any access to user data.

# ---------------------------------------------------------------------------
# data bucket
# ---------------------------------------------------------------------------

resource "aws_s3_bucket" "data" {
  bucket = local.data_bucket_name

  # Versioning is left off on purpose: with versioning, the 30-day rule below
  # would only hide the PDFs instead of deleting them.
}

# Nothing in this bucket may ever be public (NFR-SEC-04). The browser only
# reaches it through presigned URLs created by the Lambdas.
resource "aws_s3_bucket_public_access_block" "data" {
  bucket = aws_s3_bucket.data.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Encryption at rest with S3-managed keys (NFR-SEC-10). This is already the AWS
# default for new buckets; writing it down makes it visible and keeps it from
# changing by accident.
resource "aws_s3_bucket_server_side_encryption_configuration" "data" {
  bucket = aws_s3_bucket.data.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

# PDFs are deleted 30 days after upload; results are kept (NFR-SEC-06).
resource "aws_s3_bucket_lifecycle_configuration" "data" {
  bucket = aws_s3_bucket.data.id

  rule {
    id     = "delete-uploaded-pdfs"
    status = "Enabled"

    # Only objects under uploads/. Anything under results/ is never matched.
    filter {
      prefix = "uploads/"
    }

    expiration {
      days = local.uploads_retention_days
    }
  }
}

# Only HTTPS requests are accepted (NFR-SEC-10).
resource "aws_s3_bucket_policy" "data" {
  bucket = aws_s3_bucket.data.id
  policy = data.aws_iam_policy_document.data_bucket.json

  # Applying a bucket policy while the public access block is still being created
  # can fail, so wait for it.
  depends_on = [aws_s3_bucket_public_access_block.data]
}

data "aws_iam_policy_document" "data_bucket" {
  statement {
    sid     = "DenyInsecureTransport"
    effect  = "Deny"
    actions = ["s3:*"]
    resources = [
      aws_s3_bucket.data.arn,
      "${aws_s3_bucket.data.arn}/*",
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

# The CORS rules of this bucket need the CloudFront domain, so they are in
# cloudfront.tf. The S3 event that starts analyze-pdf is in
# lambdas.tf.

# ---------------------------------------------------------------------------
# web bucket
# ---------------------------------------------------------------------------

resource "aws_s3_bucket" "web" {
  bucket = local.web_bucket_name

  # Each deploy replaces the whole site, so old versions are not kept.
}

# Private: only CloudFront may read it, through Origin Access Control. That
# bucket policy is in cloudfront.tf (NFR-SEC-04).
resource "aws_s3_bucket_public_access_block" "web" {
  bucket = aws_s3_bucket.web.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "web" {
  bucket = aws_s3_bucket.web.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}
