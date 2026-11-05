# The HTTP API in front of the Lambdas (docs/architecture.md → "API contract").
#
# Requests arrive from CloudFront (cloudfront.tf), which forwards /api/* as is, so the
# routes below include the /api prefix (ADR-0008). The web app and the API share
# the CloudFront domain, so the API needs no CORS configuration (NFR-SEC-05).
#
# Every route goes through the Lambda authorizer first (ADR-0006, NFR-SEC-01):
# it is like a door guard who checks the password before anyone reaches a
# handler.

resource "aws_apigatewayv2_api" "http" {
  name          = "${local.name_prefix}-api"
  protocol_type = "HTTP"
  description   = "Gaceta Analyzer API. Every route requires the app password."

  # No `cors_configuration` on purpose (see above).
}

# ---------------------------------------------------------------------------
# Authorizer
# ---------------------------------------------------------------------------

resource "aws_apigatewayv2_authorizer" "password" {
  name            = "${local.name_prefix}-password"
  api_id          = aws_apigatewayv2_api.http.id
  authorizer_type = "REQUEST"
  authorizer_uri  = aws_lambda_function.this["authorizer"].invoke_arn

  # Payload 2.0 with "simple responses": the authorizer only answers
  # `{ isAuthorized: true | false }` (apps/api/src/handlers/authorizer.ts).
  # `false` becomes a 403.
  authorizer_payload_format_version = "2.0"
  enable_simple_responses           = true

  # API Gateway reads the password from this header. When the header is
  # missing, it answers 401 by itself, without invoking the authorizer.
  identity_sources = ["$request.header.Authorization"]

  # The answer is remembered for 5 minutes per Authorization value (ADR-0006),
  # so most requests do not invoke the authorizer at all. Side effect: after
  # changing the password in SSM, the old one may work for up to 5 minutes.
  authorizer_result_ttl_in_seconds = 300
}

# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

locals {
  # Route key → logical name of the Lambda that answers it. These are exactly
  # the routes of docs/architecture.md → "API contract". GET /api/auth/check is
  # served by list-jobs, which answers 204 for it (no separate Lambda needed).
  api_routes = {
    "POST /api/jobs"      = "create-job"
    "GET /api/jobs"       = "list-jobs"
    "GET /api/jobs/{id}"  = "get-job"
    "GET /api/auth/check" = "list-jobs"
  }

  # The Lambdas behind the routes, each listed once (list-jobs serves two).
  api_handler_lambdas = toset(values(local.api_routes))
}

# How API Gateway calls each handler Lambda ("Lambda proxy": the Lambda gets
# the whole request and returns the whole response).
resource "aws_apigatewayv2_integration" "lambda" {
  for_each = local.api_handler_lambdas

  api_id                 = aws_apigatewayv2_api.http.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.this[each.key].invoke_arn
  payload_format_version = "2.0"
}

# HTTP APIs attach the authorizer route by route. Creating every route from
# `local.api_routes` with the same settings means no route can be added
# without the authorizer.
resource "aws_apigatewayv2_route" "this" {
  for_each = local.api_routes

  api_id    = aws_apigatewayv2_api.http.id
  route_key = each.key
  target    = "integrations/${aws_apigatewayv2_integration.lambda[each.value].id}"

  authorization_type = "CUSTOM"
  authorizer_id      = aws_apigatewayv2_authorizer.password.id
}

# ---------------------------------------------------------------------------
# Stage
# ---------------------------------------------------------------------------

# `$default` serves the API at the root of its URL (no "/prod" prefix), and
# auto-deploy publishes every change without a separate deployment step.
resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.http.id
  name        = "$default"
  auto_deploy = true

  # Cost guard: with a single user, real traffic is a few requests per minute
  # (one poll every 4 seconds while a job runs). These limits only stop a
  # runaway script or an attack from invoking the Lambdas thousands of times
  # per second. Extra requests get 429 instead of reaching a Lambda.
  default_route_settings {
    throttling_rate_limit  = 10 # requests per second, on average
    throttling_burst_limit = 20 # short bursts allowed above the average
  }
}

# ---------------------------------------------------------------------------
# Permissions: API Gateway may invoke the Lambdas
# ---------------------------------------------------------------------------

# Each handler Lambda may be invoked by this API only (any stage and route).
resource "aws_lambda_permission" "api_invoke_handler" {
  for_each = local.api_handler_lambdas

  statement_id  = "AllowInvokeFromHttpApi"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.this[each.key].function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.http.execution_arn}/*/*"
}

# The authorizer Lambda may be invoked by this API's authorizer only.
resource "aws_lambda_permission" "api_invoke_authorizer" {
  statement_id  = "AllowInvokeFromHttpApiAuthorizer"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.this["authorizer"].function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.http.execution_arn}/authorizers/${aws_apigatewayv2_authorizer.password.id}"
}
