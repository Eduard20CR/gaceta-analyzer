# The `jobs` table (docs/architecture.md → "Data model", ADR-0003).
#
# DynamoDB only needs to know about the attributes used as keys (of the table
# or of an index). Every other attribute of a job (`name`, `status`, `pageCount`…)
# is written by the app without being declared here: DynamoDB tables have no
# fixed schema apart from their keys.

resource "aws_dynamodb_table" "jobs" {
  name = local.jobs_table_name

  # On-demand capacity (NFR-COST-03): we pay per read and write instead of
  # reserving capacity in advance. With a single user, the bill stays close to zero.
  billing_mode = "PAY_PER_REQUEST"

  # Partition key of the table: each job is found directly by its `id` (a UUID).
  hash_key = "id"

  attribute {
    name = "id"
    type = "S" # S = string
  }

  # Keys of the GSI below.
  attribute {
    name = "entityType"
    type = "S"
  }

  attribute {
    name = "createdAt"
    type = "S"
  }

  # Global secondary index `by-created-at`: a second view of the same items,
  # kept up to date by DynamoDB, organized by date so `list-jobs` can show the
  # newest jobs first (FR-05) without reading the whole table.
  #
  # - Partition key `entityType`: always "JOB", so every job lands in the same
  #   partition of the index and can be read with one Query.
  # - Sort key `createdAt`: ISO 8601 UTC text, which sorts in date order.
  # - Projection ALL: the index stores every attribute, so the list does not need
  #   a second read per job. It doubles the storage, which is tiny here.
  global_secondary_index {
    name            = "by-created-at"
    projection_type = "ALL"

    # HASH = partition key, RANGE = sort key. (`key_schema` replaces the
    # deprecated `hash_key`/`range_key` arguments inside an index.)
    key_schema {
      attribute_name = "entityType"
      key_type       = "HASH"
    }

    key_schema {
      attribute_name = "createdAt"
      key_type       = "RANGE"
    }
  }

  # Encryption at rest (NFR-SEC-10): DynamoDB always encrypts tables. Leaving
  # `server_side_encryption` out uses the AWS-owned key, which is the AWS
  # default and costs nothing. A KMS key would add cost without a real benefit
  # for this app.
}
