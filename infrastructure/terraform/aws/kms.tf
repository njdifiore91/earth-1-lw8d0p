# AWS Provider configuration
terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 4.0"
    }
  }
}

# Database Encryption Key
resource "aws_kms_key" "database" {
  description              = "KMS key for database encryption in ${var.environment} environment"
  deletion_window_in_days  = 30
  enable_key_rotation      = true
  key_usage               = "ENCRYPT_DECRYPT"
  customer_master_key_spec = "SYMMETRIC_DEFAULT"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "Enable IAM User Permissions"
        Effect = "Allow"
        Principal = {
          AWS = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:root"
        }
        Action   = "kms:*"
        Resource = "*"
      },
      {
        Sid    = "Allow RDS Service"
        Effect = "Allow"
        Principal = {
          Service = "rds.amazonaws.com"
        }
        Action = [
          "kms:Encrypt",
          "kms:Decrypt",
          "kms:ReEncrypt*",
          "kms:GenerateDataKey*",
          "kms:CreateGrant",
          "kms:ListGrants",
          "kms:DescribeKey"
        ]
        Resource = "*"
      }
    ]
  })

  tags = merge(var.tags, {
    Name = "matter-${var.environment}-database-key"
    Type = "Database"
  })
}

resource "aws_kms_alias" "database" {
  name          = "alias/matter-${var.environment}-database"
  target_key_id = aws_kms_key.database.key_id
}

# Cache Encryption Key
resource "aws_kms_key" "cache" {
  description              = "KMS key for cache encryption in ${var.environment} environment"
  deletion_window_in_days  = 30
  enable_key_rotation      = true
  key_usage               = "ENCRYPT_DECRYPT"
  customer_master_key_spec = "SYMMETRIC_DEFAULT"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "Enable IAM User Permissions"
        Effect = "Allow"
        Principal = {
          AWS = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:root"
        }
        Action   = "kms:*"
        Resource = "*"
      },
      {
        Sid    = "Allow ElastiCache Service"
        Effect = "Allow"
        Principal = {
          Service = "elasticache.amazonaws.com"
        }
        Action = [
          "kms:Encrypt",
          "kms:Decrypt",
          "kms:ReEncrypt*",
          "kms:GenerateDataKey*",
          "kms:CreateGrant",
          "kms:ListGrants",
          "kms:DescribeKey"
        ]
        Resource = "*"
      }
    ]
  })

  tags = merge(var.tags, {
    Name = "matter-${var.environment}-cache-key"
    Type = "Cache"
  })
}

resource "aws_kms_alias" "cache" {
  name          = "alias/matter-${var.environment}-cache"
  target_key_id = aws_kms_key.cache.key_id
}

# Backup Encryption Key
resource "aws_kms_key" "backup" {
  description              = "KMS key for backup encryption in ${var.environment} environment"
  deletion_window_in_days  = 30
  enable_key_rotation      = true
  key_usage               = "ENCRYPT_DECRYPT"
  customer_master_key_spec = "SYMMETRIC_DEFAULT"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "Enable IAM User Permissions"
        Effect = "Allow"
        Principal = {
          AWS = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:root"
        }
        Action   = "kms:*"
        Resource = "*"
      },
      {
        Sid    = "Allow Backup Service"
        Effect = "Allow"
        Principal = {
          Service = "backup.amazonaws.com"
        }
        Action = [
          "kms:Encrypt",
          "kms:Decrypt",
          "kms:ReEncrypt*",
          "kms:GenerateDataKey*",
          "kms:CreateGrant",
          "kms:ListGrants",
          "kms:DescribeKey"
        ]
        Resource = "*"
      }
    ]
  })

  tags = merge(var.tags, {
    Name = "matter-${var.environment}-backup-key"
    Type = "Backup"
  })
}

resource "aws_kms_alias" "backup" {
  name          = "alias/matter-${var.environment}-backup"
  target_key_id = aws_kms_key.backup.key_id
}

# CloudWatch Monitoring for KMS Keys
resource "aws_cloudwatch_metric_alarm" "key_usage" {
  for_each = {
    database = aws_kms_key.database.id
    cache    = aws_kms_key.cache.id
    backup   = aws_kms_key.backup.id
  }

  alarm_name          = "matter-${var.environment}-${each.key}-key-usage"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "1"
  metric_name         = "KeyUsage"
  namespace           = "AWS/KMS"
  period             = "300"
  statistic          = "Sum"
  threshold          = "1000"
  alarm_description  = "Monitor KMS key usage for ${each.key} encryption"
  alarm_actions      = [data.aws_sns_topic.alerts.arn]

  dimensions = {
    KeyId = each.value
  }

  tags = merge(var.tags, {
    Name = "matter-${var.environment}-${each.key}-key-monitoring"
    Type = "Monitoring"
  })
}

# Data Sources
data "aws_caller_identity" "current" {}
data "aws_sns_topic" "alerts" {
  name = "matter-${var.environment}-alerts"
}

# Outputs
output "database_encryption_key" {
  value = {
    key_id    = aws_kms_key.database.key_id
    key_arn   = aws_kms_key.database.arn
    alias_arn = aws_kms_alias.database.arn
  }
  description = "Database encryption key details"
}

output "cache_encryption_key" {
  value = {
    key_id    = aws_kms_key.cache.key_id
    key_arn   = aws_kms_key.cache.arn
    alias_arn = aws_kms_alias.cache.arn
  }
  description = "Cache encryption key details"
}

output "backup_encryption_key" {
  value = {
    key_id    = aws_kms_key.backup.key_id
    key_arn   = aws_kms_key.backup.arn
    alias_arn = aws_kms_alias.backup.arn
  }
  description = "Backup encryption key details"
}