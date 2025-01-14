# AWS Provider requirement
terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 4.0"
    }
  }
}

# Variables
variable "environment" {
  description = "Deployment environment (dev/staging/prod)"
  type        = string
}

variable "vpc_id" {
  description = "VPC ID for database deployment"
  type        = string
}

variable "subnet_ids" {
  description = "List of subnet IDs for Multi-AZ deployment"
  type        = list(string)
}

variable "kms_key_id" {
  description = "KMS key ID for database encryption"
  type        = string
}

# Database subnet group
resource "aws_db_subnet_group" "main" {
  name        = "matter-${var.environment}-db-subnet"
  subnet_ids  = var.subnet_ids
  description = "Database subnet group for Matter platform ${var.environment} environment"

  tags = {
    Name        = "matter-${var.environment}-db-subnet"
    Environment = var.environment
    CostCenter  = "platform-infrastructure"
    Terraform   = "true"
  }
}

# Security group for database access
resource "aws_security_group" "database" {
  name        = "matter-${var.environment}-db-sg"
  description = "Security group for Matter platform database"
  vpc_id      = var.vpc_id

  ingress {
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.app.id]
    description     = "PostgreSQL access from application layer"
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
    description = "Allow all outbound traffic"
  }

  tags = {
    Name        = "matter-${var.environment}-db-sg"
    Environment = var.environment
    Terraform   = "true"
  }
}

# Application security group
resource "aws_security_group" "app" {
  name        = "matter-${var.environment}-app-sg"
  description = "Security group for Matter platform application"
  vpc_id      = var.vpc_id

  tags = {
    Name        = "matter-${var.environment}-app-sg"
    Environment = var.environment
    Terraform   = "true"
  }
}

# Enhanced monitoring role
resource "aws_iam_role" "monitoring" {
  name = "matter-${var.environment}-db-monitoring"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "monitoring.rds.amazonaws.com"
        }
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "monitoring" {
  role       = aws_iam_role.monitoring.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonRDSEnhancedMonitoringRole"
}

# Parameter group for PostgreSQL optimization
resource "aws_db_parameter_group" "main" {
  family = "postgres14"
  name   = "matter-${var.environment}-pg14"

  parameter {
    name  = "shared_preload_libraries"
    value = "pg_stat_statements,postgis"
  }

  parameter {
    name  = "log_min_duration_statement"
    value = "1000"
  }

  parameter {
    name  = "rds.force_ssl"
    value = "1"
  }

  parameter {
    name  = "max_connections"
    value = "1000"
  }

  tags = {
    Name        = "matter-${var.environment}-pg14"
    Environment = var.environment
    Terraform   = "true"
  }
}

# RDS instance
resource "aws_db_instance" "main" {
  identifier = "matter-${var.environment}-db"
  
  # Engine configuration
  engine                = "postgres"
  engine_version        = "14.7"
  instance_class        = "db.r6g.large"
  allocated_storage     = 100
  max_allocated_storage = 1000
  
  # Database configuration
  db_name  = "matter_${var.environment}"
  username = "matter_admin"
  port     = 5432

  # Network configuration
  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [aws_security_group.database.id]
  multi_az              = true
  publicly_accessible   = false

  # Security configuration
  storage_encrypted        = true
  kms_key_id              = var.kms_key_id
  iam_database_authentication_enabled = true
  
  # Monitoring configuration
  monitoring_interval             = 1
  monitoring_role_arn            = aws_iam_role.monitoring.arn
  performance_insights_enabled    = true
  performance_insights_retention_period = 7
  performance_insights_kms_key_id = var.kms_key_id
  enabled_cloudwatch_logs_exports = ["postgresql", "upgrade"]

  # Backup configuration
  backup_retention_period = 35
  backup_window          = "03:00-04:00"
  maintenance_window     = "Mon:04:00-Mon:05:00"
  
  # Parameter group
  parameter_group_name = aws_db_parameter_group.main.name

  # Additional configuration
  auto_minor_version_upgrade = true
  deletion_protection       = true
  skip_final_snapshot      = false
  final_snapshot_identifier = "matter-${var.environment}-db-final"
  copy_tags_to_snapshot    = true

  tags = {
    Name        = "matter-${var.environment}-db"
    Environment = var.environment
    CostCenter  = "platform-infrastructure"
    Terraform   = "true"
  }
}

# CloudWatch alarms
resource "aws_cloudwatch_metric_alarm" "cpu_utilization" {
  alarm_name          = "matter-${var.environment}-db-cpu"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "CPUUtilization"
  namespace           = "AWS/RDS"
  period             = "300"
  statistic          = "Average"
  threshold          = "80"
  alarm_description  = "Database CPU utilization is too high"

  dimensions = {
    DBInstanceIdentifier = aws_db_instance.main.id
  }

  tags = {
    Name        = "matter-${var.environment}-db-cpu-alarm"
    Environment = var.environment
    Terraform   = "true"
  }
}

# Outputs
output "db_instance_id" {
  description = "The RDS instance identifier"
  value       = aws_db_instance.main.id
}

output "db_endpoint" {
  description = "The RDS instance endpoint"
  value       = aws_db_instance.main.endpoint
}

output "db_security_group_id" {
  description = "The security group ID for database access"
  value       = aws_security_group.database.id
}

output "monitoring_role_arn" {
  description = "The ARN of the monitoring IAM role"
  value       = aws_iam_role.monitoring.arn
}