# Values other parts of the project need: the Lambdas' environment variables
# (#30), the deploy workflow (#34) and CloudFront (#32).

output "jobs_table_name" {
  description = "Name of the DynamoDB jobs table (TABLE_NAME of the Lambdas)."
  value       = aws_dynamodb_table.jobs.name
}

output "jobs_table_arn" {
  description = "ARN of the DynamoDB jobs table, for the Lambda IAM policies."
  value       = aws_dynamodb_table.jobs.arn
}

output "data_bucket_name" {
  description = "Name of the S3 bucket with the uploaded PDFs and the results (DATA_BUCKET_NAME of the Lambdas)."
  value       = aws_s3_bucket.data.id
}

output "data_bucket_arn" {
  description = "ARN of the data bucket, for the Lambda IAM policies."
  value       = aws_s3_bucket.data.arn
}

output "web_bucket_name" {
  description = "Name of the S3 bucket with the built frontend (target of the deploy workflow)."
  value       = aws_s3_bucket.web.id
}

output "web_bucket_arn" {
  description = "ARN of the web bucket, for the CloudFront bucket policy."
  value       = aws_s3_bucket.web.arn
}

output "lambda_function_names" {
  description = "Name of each Lambda in AWS, by logical name (for example create-job = gaceta-analyzer-create-job)."
  value       = { for name, function in aws_lambda_function.this : name => function.function_name }
}

output "lambda_invoke_arns" {
  description = "Invoke ARN of each Lambda, by logical name, for the API Gateway integrations (#31)."
  value       = { for name, function in aws_lambda_function.this : name => function.invoke_arn }
}

output "api_endpoint" {
  description = "URL of the HTTP API (origin of the /api/* behavior in CloudFront, #32, and VITE_DEV_API_PROXY_TARGET for local development)."
  value       = aws_apigatewayv2_api.http.api_endpoint
}

output "cloudfront_distribution_id" {
  description = "Id of the CloudFront distribution (deploy.yml invalidates /index.html on it)."
  value       = aws_cloudfront_distribution.app.id
}

output "app_url" {
  description = "Address of the app: open it in the browser."
  value       = "https://${aws_cloudfront_distribution.app.domain_name}"
}
