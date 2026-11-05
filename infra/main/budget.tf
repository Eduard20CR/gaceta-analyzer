# Monthly cost alarm (NFR-COST-01).
#
# AWS Budgets compares the month's spend of the whole account with the limit
# and sends an email when a threshold is crossed. It only warns: AWS never stops
# or deletes anything when a budget is exceeded. The DeepSeek spend is not part
# of the AWS bill; it has its own limit in the DeepSeek console (issue #28).

resource "aws_budgets_budget" "monthly" {
  # Must start with the project prefix: the deploy role can only manage budgets
  # named `gaceta-analyzer-*` (infra/bootstrap/deploy-role-permissions.tf).
  name         = "${local.name_prefix}-monthly"
  budget_type  = "COST"
  limit_amount = "10"
  limit_unit   = "USD"
  time_unit    = "MONTHLY"

  # 80% of the real spend so far this month (USD 8): the alarm the requirement
  # asks for.
  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 80
    threshold_type             = "PERCENTAGE"
    notification_type          = "ACTUAL"
    subscriber_email_addresses = [var.budget_alert_email]
  }

  # Optional extra warning: AWS forecasts that the month will end above USD 10.
  # It can arrive earlier than the 80% alarm, when a sudden jump in usage
  # (for example, many large PDFs in one day) makes the forecast go up.
  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 100
    threshold_type             = "PERCENTAGE"
    notification_type          = "FORECASTED"
    subscriber_email_addresses = [var.budget_alert_email]
  }
}
