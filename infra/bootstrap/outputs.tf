output "state_bucket_name" {
  description = "S3 bucket for the state of infra/main. Use it as `bucket` in the backend block of infra/main."
  value       = aws_s3_bucket.terraform_state.bucket
}

output "deploy_role_arn" {
  description = "IAM role for GitHub Actions. Save it as the repository variable AWS_DEPLOY_ROLE_ARN."
  value       = aws_iam_role.github_deploy.arn
}

output "lambda_permissions_boundary_arn" {
  description = "Permissions boundary that every IAM role created by infra/main must use (`permissions_boundary`)."
  value       = aws_iam_policy.lambda_boundary.arn
}
