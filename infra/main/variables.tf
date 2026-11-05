# Input variables of infra/main.
#
# Names are derived from the account id (locals.tf) and the region is fixed
# (NFR-DEP-07), so only values that change per person are variables.
#
# Never add a variable for a secret: secrets live only in SSM Parameter Store
# (NFR-SEC-02).

# Where the AWS Budgets alarm is sent (budget.tf, NFR-COST-01).
#
# It is not a secret, but it is personal, so it is not written in the repository.
# - In GitHub Actions: the repository variable BUDGET_ALERT_EMAIL, passed to
#   Terraform as the environment variable TF_VAR_budget_alert_email (#34).
# - Locally: `-var 'budget_alert_email=…'`, or a `terraform.tfvars` file in this
#   folder (git-ignored; copy terraform.tfvars.example).
variable "budget_alert_email" {
  description = "Email address that receives the monthly AWS budget alerts."
  type        = string

  validation {
    # A light check that catches an empty value or a typo such as a missing "@".
    # AWS sends a real confirmation only when the alert fires.
    condition     = can(regex("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$", var.budget_alert_email))
    error_message = "budget_alert_email must be an email address, for example name@example.com."
  }
}
