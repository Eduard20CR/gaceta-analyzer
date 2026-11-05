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
