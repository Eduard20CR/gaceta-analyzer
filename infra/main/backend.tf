# Where Terraform keeps the state of infra/main (NFR-DEP-03, ADR-0011).
#
# The state lives in the bucket created by infra/bootstrap. The bucket name is
# not written here, because it contains the AWS account id. Pass it when
# initializing:
#
#   terraform init -backend-config="bucket=<state_bucket_name output of the bootstrap>"
#
# In GitHub Actions it comes from the repository variable TF_STATE_BUCKET (#34).
# To only check the files locally, without AWS access:
#
#   terraform init -backend=false && terraform validate

terraform {
  backend "s3" {
    key    = "main/terraform.tfstate"
    region = "us-east-1"

    # Native S3 locking: Terraform writes a ".tflock" file next to the state, so
    # two runs can never change the state at the same time. No DynamoDB lock
    # table is needed.
    use_lockfile = true

    # The state can contain sensitive values, so it is stored encrypted.
    encrypt = true
  }
}
