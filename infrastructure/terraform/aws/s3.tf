# AWS Provider configuration
terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 4.0"
    }
  }
}

# Local variables
locals {
  bucket_prefix = "matter-platform-${var.environment}"
}

# S3 bucket for storing KML files
resource "aws_s3_bucket" "kml_files" {
  bucket = "${local.bucket_prefix}-kml-files"
  tags   = var.tags

  # Enable versioning for file history and recovery
  versioning {
    enabled = true
  }

  # Server-side encryption configuration
  server_side_encryption_configuration {
    rule {
      apply_server_side_encryption_by_default {
        kms_master_key_id = data.aws_kms_key.s3.arn
        sse_algorithm     = "aws:kms"
      }
    }
  }

  # Lifecycle rules for cost optimization
  lifecycle_rule {
    enabled = true
    transition {
      days          = 90
      storage_class = "STANDARD_IA"
    }
  }

  # Access logging configuration
  logging {
    target_bucket = aws_s3_bucket.logs.id
    target_prefix = "kml-files/"
  }
}

# S3 bucket for export data
resource "aws_s3_bucket" "export_data" {
  bucket = "${local.bucket_prefix}-export-data"
  tags   = var.tags

  versioning {
    enabled = true
  }

  server_side_encryption_configuration {
    rule {
      apply_server_side_encryption_by_default {
        kms_master_key_id = data.aws_kms_key.s3.arn
        sse_algorithm     = "aws:kms"
      }
    }
  }

  # Lifecycle rule for automatic expiration
  lifecycle_rule {
    enabled = true
    expiration {
      days = 30
    }
  }

  logging {
    target_bucket = aws_s3_bucket.logs.id
    target_prefix = "export-data/"
  }
}

# S3 bucket for static assets
resource "aws_s3_bucket" "static_assets" {
  bucket = "${local.bucket_prefix}-static-assets"
  tags   = var.tags

  versioning {
    enabled = true
  }

  server_side_encryption_configuration {
    rule {
      apply_server_side_encryption_by_default {
        kms_master_key_id = data.aws_kms_key.s3.arn
        sse_algorithm     = "aws:kms"
      }
    }
  }

  # CORS configuration for web access
  cors_rule {
    allowed_headers = ["*"]
    allowed_methods = ["GET"]
    allowed_origins = [var.app_domain]
    max_age_seconds = 3600
  }

  logging {
    target_bucket = aws_s3_bucket.logs.id
    target_prefix = "static-assets/"
  }
}

# S3 bucket for access logs
resource "aws_s3_bucket" "logs" {
  bucket = "${local.bucket_prefix}-logs"
  tags   = var.tags

  lifecycle_rule {
    enabled = true
    expiration {
      days = 90
    }
  }

  server_side_encryption_configuration {
    rule {
      apply_server_side_encryption_by_default {
        sse_algorithm = "AES256"
      }
    }
  }
}

# Bucket policies
resource "aws_s3_bucket_policy" "kml_files" {
  bucket = aws_s3_bucket.kml_files.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "DenyUnencryptedObjectUploads"
        Effect    = "Deny"
        Principal = "*"
        Action    = "s3:PutObject"
        Resource  = "${aws_s3_bucket.kml_files.arn}/*"
        Condition = {
          StringNotEquals = {
            "s3:x-amz-server-side-encryption" = "aws:kms"
          }
        }
      }
    ]
  })
}

resource "aws_s3_bucket_policy" "static_assets" {
  bucket = aws_s3_bucket.static_assets.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "AllowCloudFrontAccess"
        Effect    = "Allow"
        Principal = {
          AWS = aws_cloudfront_origin_access_identity.default.iam_arn
        }
        Action   = "s3:GetObject"
        Resource = "${aws_s3_bucket.static_assets.arn}/*"
      }
    ]
  })
}

# Block public access for all buckets
resource "aws_s3_bucket_public_access_block" "kml_files" {
  bucket                  = aws_s3_bucket.kml_files.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_public_access_block" "export_data" {
  bucket                  = aws_s3_bucket.export_data.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_public_access_block" "static_assets" {
  bucket                  = aws_s3_bucket.static_assets.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Outputs
output "kml_bucket_name" {
  value       = aws_s3_bucket.kml_files.id
  description = "Name of the KML files bucket"
}

output "export_bucket_name" {
  value       = aws_s3_bucket.export_data.id
  description = "Name of the export data bucket"
}

output "static_assets_bucket_name" {
  value       = aws_s3_bucket.static_assets.id
  description = "Name of the static assets bucket"
}