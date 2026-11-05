# Terraform bootstrap

This folder creates the few AWS resources that must exist **before** GitHub Actions can deploy anything (ADR-0011). It also uses the account's existing GitHub OIDC provider, which it does not create (see below).

| Resource   | Name                                   | Why                                                                                                                 |
| ---------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| S3 bucket  | `gaceta-analyzer-tfstate-<account id>` | Stores the Terraform state of `infra/main` (versioned, encrypted, never public).                                    |
| IAM role   | `gaceta-analyzer-github-deploy`        | Assumed by the workflows of this repository: on the `main` branch (deploy) and on pull requests (`terraform plan`). |
| IAM policy | `gaceta-analyzer-lambda-boundary`      | Permissions boundary: the most any Lambda role created by `infra/main` can ever do.                                 |

## The GitHub OIDC provider is shared

The IAM OIDC provider `token.actions.githubusercontent.com` lets GitHub Actions get temporary AWS credentials, so no access keys live in GitHub (NFR-SEC-09). An AWS account can have **only one** provider for that URL, and every project in the account that deploys from GitHub shares it. Each project adds its own IAM role, and that role's trust policy decides which repository may use it.

So the bootstrap does **not** create the provider: it looks it up (`data "aws_iam_openid_connect_provider"` in [`github-oidc.tf`](github-oidc.tf)). This project never changes or deletes it, and the deploy role still trusts only this repository. If another project deletes the provider, this project's deploys stop working until it is created again.

It is applied **once, by hand**, from your computer. Its state (`terraform.tfstate`) stays on your computer: it is git-ignored and must not be committed. Keep a copy somewhere safe (for example, a password manager); if it is lost, the resources keep working, but changing them again needs `terraform import`.

## Naming rule for `infra/main`

The deploy role can only manage resources whose name starts with **`gaceta-analyzer-`** (except API Gateway and CloudFront, which AWS identifies by generated ids). So every bucket, table, Lambda, IAM role, IAM policy and budget in `infra/main` must use that prefix, for example `gaceta-analyzer-jobs` for the `jobs` table.

Two more rules for `infra/main`:

- Every IAM role it creates must set `permissions_boundary` to the `lambda_permissions_boundary_arn` output. Without it, AWS rejects the role.
- The deploy role cannot read SSM parameters (only the Lambdas can, NFR-SEC-07). Build parameter ARNs as strings instead of using `data "aws_ssm_parameter"`.

When `infra/main` needs a new AWS service, add it to [`deploy-role-permissions.tf`](deploy-role-permissions.tf) and apply this folder again (step 1).

## Before you start

- [Terraform](https://developer.hashicorp.com/terraform/install) 1.10 or later (`terraform version`).
- The [AWS CLI](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html) v2, signed in to the AWS account of the app with a user that can create IAM roles and S3 buckets (for example, `aws sso login` or `aws configure`). Check with:

  ```sh
  aws sts get-caller-identity
  ```

- Admin access to the GitHub repository.
- The GitHub OIDC provider in the account. Check that it exists:

  ```sh
  aws iam list-open-id-connect-providers
  ```

  The output must contain an ARN ending in `oidc-provider/token.actions.githubusercontent.com`. If it is missing, create it once (it is shared by every project in the account):

  ```sh
  aws iam create-open-id-connect-provider \
    --url https://token.actions.githubusercontent.com \
    --client-id-list sts.amazonaws.com
  ```

  Its audience must include `sts.amazonaws.com` (check with `aws iam get-open-id-connect-provider --open-id-connect-provider-arn <arn>`).

## 1. Apply the bootstrap (issue #27)

```sh
cd infra/bootstrap
terraform init
terraform plan     # read it: only the resources in the table above should be created (the OIDC provider is only read)
terraform apply
```

At the end, Terraform prints three outputs:

```
deploy_role_arn                 = "arn:aws:iam::123456789012:role/gaceta-analyzer-github-deploy"
lambda_permissions_boundary_arn = "arn:aws:iam::123456789012:policy/gaceta-analyzer-lambda-boundary"
state_bucket_name               = "gaceta-analyzer-tfstate-123456789012"
```

You can show them again at any time with `terraform output`.

The defaults fit this repository. If the repository is renamed or moved, pass the new name: `terraform apply -var 'github_repository=owner/name'`.

## 2. Save the outputs in GitHub (issue #27)

In GitHub, go to the repository → **Settings** → **Secrets and variables** → **Actions** → **Variables** tab → **New repository variable**, and create:

| Name                  | Value                                                                         |
| --------------------- | ----------------------------------------------------------------------------- |
| `AWS_DEPLOY_ROLE_ARN` | the `deploy_role_arn` output                                                  |
| `TF_STATE_BUCKET`     | the `state_bucket_name` output                                                |
| `BUDGET_ALERT_EMAIL`  | the email address that receives the AWS budget alarm (`infra/main/budget.tf`) |

They are **variables**, not secrets: none of these values gives access by itself. Do **not** create any AWS access key secret; the workflows use OIDC.

A workflow job that uses the role must not set `environment:`. GitHub then sends a different identity and AWS rejects it (see the trust policy in [`github-oidc.tf`](github-oidc.tf)).

## 3. Create the secrets in SSM (issue #28)

The app password and the DeepSeek API key live only in SSM Parameter Store as `SecureString` (NFR-SEC-02). Terraform does not create them, so they never appear in the Terraform state.

`read -s` asks for the value without showing it and without saving it in your shell history:

```sh
read -rs APP_PASSWORD   # type the password the app user will type at login, then Enter
aws ssm put-parameter --region us-east-1 \
  --name /gaceta-analyzer/app-password \
  --type SecureString \
  --value "$APP_PASSWORD"
unset APP_PASSWORD

read -rs DEEPSEEK_API_KEY   # paste the key from platform.deepseek.com, then Enter
aws ssm put-parameter --region us-east-1 \
  --name /gaceta-analyzer/deepseek-api-key \
  --type SecureString \
  --value "$DEEPSEEK_API_KEY"
unset DEEPSEEK_API_KEY
```

To change a value later, run the same command with `--overwrite`. After a password change, the old password may keep working for up to 5 minutes (authorizer cache, ADR-0006).

Check that both exist (this shows the names and types, not the values):

```sh
aws ssm describe-parameters --region us-east-1 \
  --parameter-filters "Key=Name,Option=BeginsWith,Values=/gaceta-analyzer/"
```

## 4. Limit DeepSeek spending (issue #28, NFR-COST-02)

DeepSeek is prepaid: calls stop when the balance reaches zero, so the balance is the spending limit.

1. Sign in to [platform.deepseek.com](https://platform.deepseek.com).
2. Top up a small amount (for example, USD 5). A 500-page Gaceta costs a few cents to analyze.
3. If the account offers automatic top-up, keep it **off**.
4. Optionally, create an API key used only by this app (the one saved in step 3), so it can be revoked without affecting anything else.

## Changing or removing the bootstrap

Run `terraform plan` and `terraform apply` again in this folder after changing it. The state bucket has `prevent_destroy`, so `terraform destroy` stops with an error on purpose; delete that line first only if you really want to remove everything.
