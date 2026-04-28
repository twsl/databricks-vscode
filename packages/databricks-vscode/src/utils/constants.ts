export type Cloud = "aws" | "azure" | "gcp";

// Minimum Databricks Connect version for classic cluster-based workflows (DBR 13+).
// See: https://docs.databricks.com/aws/en/dev-tools/databricks-connect/requirements#versions
export const DATABRICKS_CONNECT_VERSION = "13.3.11";

// Minimum Databricks Connect version that supports serverless compute.
// See: https://docs.databricks.com/aws/en/dev-tools/databricks-connect/requirements#versions
export const DATABRICKS_CONNECT_SERVERLESS_MIN_VERSION = "15.4.10";
