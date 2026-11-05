# The CloudFront distribution: the single address of the app (ADR-0008,
# NFR-DEP-06, docs/architecture.md → "CloudFront configuration").
#
# One distribution with two origins, chosen by the path:
#   /api/*  → API Gateway, never cached (every answer depends on the password
#             and the data).
#   /*      → the `web` bucket with the built frontend, cached.
# Because the browser sees both under the same domain, the API needs no CORS.

# ---------------------------------------------------------------------------
# Managed policies (defined by AWS, looked up by name)
# ---------------------------------------------------------------------------

data "aws_cloudfront_cache_policy" "caching_optimized" {
  name = "Managed-CachingOptimized"
}

data "aws_cloudfront_cache_policy" "caching_disabled" {
  name = "Managed-CachingDisabled"
}

# Sends every viewer header (including Authorization), the query string and
# the cookies to the API, except Host: API Gateway must receive its own host
# name, not the CloudFront one.
data "aws_cloudfront_origin_request_policy" "all_viewer_except_host_header" {
  name = "Managed-AllViewerExceptHostHeader"
}

# ---------------------------------------------------------------------------
# Web bucket access and SPA routing
# ---------------------------------------------------------------------------

# Origin Access Control: CloudFront signs its requests to the `web` bucket, and
# the bucket policy below only accepts requests signed for this distribution.
# The bucket itself stays private (NFR-SEC-04).
resource "aws_cloudfront_origin_access_control" "web" {
  name                              = "${local.name_prefix}-web"
  description                       = "Lets the app distribution read the web bucket."
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# Sends paths without a file extension (for example /jobs/3f6c…) to
# /index.html, so React Router can show the page. See the comments in the file.
resource "aws_cloudfront_function" "spa_rewrite" {
  name    = "${local.name_prefix}-spa-rewrite"
  runtime = "cloudfront-js-2.0"
  comment = "Rewrites paths without a file extension to /index.html."
  code    = file("${path.module}/functions/spa-rewrite.js")
  publish = true
}

# ---------------------------------------------------------------------------
# Distribution
# ---------------------------------------------------------------------------

locals {
  web_origin_id = "web-bucket"
  api_origin_id = "api-gateway"

  # api_endpoint is "https://<id>.execute-api.us-east-1.amazonaws.com"; an
  # origin needs only the host name.
  api_domain_name = replace(aws_apigatewayv2_api.http.api_endpoint, "https://", "")
}

resource "aws_cloudfront_distribution" "app" {
  enabled             = true
  comment             = "Gaceta Analyzer: web app and /api"
  default_root_object = "index.html"
  is_ipv6_enabled     = true
  http_version        = "http2and3"

  # The cheapest price class: edge locations in North America and Europe. Costa
  # Rica is served from the nearest one (Miami), which is fast enough for a
  # single user and keeps the bill low (NFR-COST-01).
  price_class = "PriceClass_100"

  origin {
    origin_id                = local.web_origin_id
    domain_name              = aws_s3_bucket.web.bucket_regional_domain_name
    origin_access_control_id = aws_cloudfront_origin_access_control.web.id
  }

  origin {
    origin_id   = local.api_origin_id
    domain_name = local.api_domain_name

    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "https-only"
      origin_ssl_protocols   = ["TLSv1.2"]
    }
  }

  # Default behavior: the frontend files.
  default_cache_behavior {
    target_origin_id       = local.web_origin_id
    viewer_protocol_policy = "redirect-to-https" # NFR-SEC-10
    allowed_methods        = ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]
    cache_policy_id        = data.aws_cloudfront_cache_policy.caching_optimized.id
    compress               = true

    function_association {
      event_type   = "viewer-request"
      function_arn = aws_cloudfront_function.spa_rewrite.arn
    }
  }

  # /api/*: everything goes to API Gateway as is, including the /api prefix
  # (the routes in api-gateway.tf include it).
  ordered_cache_behavior {
    path_pattern             = "/api/*"
    target_origin_id         = local.api_origin_id
    viewer_protocol_policy   = "redirect-to-https"
    allowed_methods          = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
    cached_methods           = ["GET", "HEAD"]
    cache_policy_id          = data.aws_cloudfront_cache_policy.caching_disabled.id
    origin_request_policy_id = data.aws_cloudfront_origin_request_policy.all_viewer_except_host_header.id
    compress                 = true
  }

  # No `custom_error_response` blocks on purpose: they apply to the whole
  # distribution and would turn the API's real 403 and 404 answers into
  # index.html. SPA routing is done by spa-rewrite instead.

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  # The default https://<id>.cloudfront.net domain and certificate. A custom
  # domain can be added later (ACM certificate in us-east-1 + DNS).
  viewer_certificate {
    cloudfront_default_certificate = true
  }
}

# ---------------------------------------------------------------------------
# Web bucket policy: readable only by this distribution
# ---------------------------------------------------------------------------

resource "aws_s3_bucket_policy" "web" {
  bucket = aws_s3_bucket.web.id
  policy = data.aws_iam_policy_document.web_bucket.json

  # Applying a bucket policy while the public access block is still being
  # created can fail, so wait for it.
  depends_on = [aws_s3_bucket_public_access_block.web]
}

data "aws_iam_policy_document" "web_bucket" {
  statement {
    sid       = "AllowReadFromTheAppDistribution"
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.web.arn}/*"]

    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }

    # Only this distribution: another CloudFront distribution (even in another
    # AWS account) cannot read the bucket.
    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [aws_cloudfront_distribution.app.arn]
    }
  }

  # Only HTTPS requests are accepted (NFR-SEC-10), as on the data bucket.
  statement {
    sid     = "DenyInsecureTransport"
    effect  = "Deny"
    actions = ["s3:*"]
    resources = [
      aws_s3_bucket.web.arn,
      "${aws_s3_bucket.web.arn}/*",
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

# ---------------------------------------------------------------------------
# Data bucket CORS (NFR-SEC-05)
# ---------------------------------------------------------------------------

# The browser talks to the data bucket directly: it uploads the PDF with the
# presigned POST and reads it with the presigned GET for the viewer. That is
# another origin than the app, so the bucket must allow the app's domain. It
# lives here because the domain only exists once the distribution does.
resource "aws_s3_bucket_cors_configuration" "data" {
  bucket = aws_s3_bucket.data.id

  cors_rule {
    allowed_origins = [
      "https://${aws_cloudfront_distribution.app.domain_name}",
      # The Vite dev server (`npm run dev -w @gaceta/web`).
      "http://localhost:5173",
    ]
    allowed_methods = ["POST", "GET"]
    allowed_headers = ["*"]
    # pdf.js reads these to download a large PDF in parts (range requests)
    # instead of all at once. Without them it still works, only slower.
    expose_headers  = ["Accept-Ranges", "Content-Length", "Content-Range", "ETag"]
    max_age_seconds = 3600
  }
}
