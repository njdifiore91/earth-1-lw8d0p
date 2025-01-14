# AWS Provider configuration
terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 4.0"
    }
  }
}

# KMS key for RDS encryption
resource "aws_kms_key" "rds" {
  description             = "KMS key for RDS cluster encryption"
  deletion_window_in_days = 30
  enable_key_rotation     = true

  tags = {
    Name        = "${var.environment}-rds-encryption-key"
    Environment = var.environment
  }
}

# RDS subnet group
resource "aws_db_subnet_group" "main" {
  name        = "${var.environment}-rds-subnet-group"
  description = "RDS subnet group for ${var.environment} environment"
  subnet_ids  = database_subnet_ids

  tags = {
    Name        = "${var.environment}-rds-subnet-group"
    Environment = var.environment
  }
}

# RDS cluster parameter group
resource "aws_rds_cluster_parameter_group" "main" {
  family      = "aurora-postgresql14"
  name        = "${var.environment}-rds-cluster-params"
  description = "RDS cluster parameter group for ${var.environment}"

  parameter {
    name  = "shared_preload_libraries"
    value = "postgis,pg_stat_statements"
  }

  parameter {
    name  = "log_statement"
    value = "all"
  }

  parameter {
    name  = "log_min_duration_statement"
    value = "1000"
  }

  parameter {
    name  = "ssl"
    value = "1"
  }

  tags = {
    Name        = "${var.environment}-rds-cluster-params"
    Environment = var.environment
  }
}

# RDS instance parameter group
resource "aws_db_parameter_group" "main" {
  family = "aurora-postgresql14"
  name   = "${var.environment}-rds-instance-params"

  parameter {
    name  = "postgis.enable_outdb_rasters"
    value = "1"
  }

  parameter {
    name  = "pg_stat_statements.track"
    value = "all"
  }

  tags = {
    Name        = "${var.environment}-rds-instance-params"
    Environment = var.environment
  }
}

# Enhanced monitoring IAM role
resource "aws_iam_role" "rds_enhanced_monitoring" {
  name = "${var.environment}-rds-monitoring-role"

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

  managed_policy_arns = ["arn:aws:iam::aws:policy/service-role/AmazonRDSEnhancedMonitoringRole"]
}

# RDS cluster
resource "aws_rds_cluster" "main" {
  cluster_identifier     = "${var.environment}-aurora-cluster"
  engine                = "aurora-postgresql"
  engine_version        = "14.6"
  database_name         = "matter_${var.environment}"
  master_username       = "matter_admin"
  master_password       = aws_secretsmanager_secret_version.rds_password.secret_string
  port                 = 5432
  
  db_subnet_group_name            = aws_db_subnet_group.main.name
  vpc_security_group_ids          = [aws_security_group.rds.id]
  db_cluster_parameter_group_name = aws_rds_cluster_parameter_group.main.name

  storage_encrypted       = true
  kms_key_id             = aws_kms_key.rds.arn
  backup_retention_period = 35
  preferred_backup_window = "03:00-04:00"
  
  enabled_cloudwatch_logs_exports = ["postgresql", "upgrade"]
  
  skip_final_snapshot     = false
  final_snapshot_identifier = "${var.environment}-aurora-final-snapshot"
  
  apply_immediately = false
  
  tags = {
    Name        = "${var.environment}-aurora-cluster"
    Environment = var.environment
  }
}

# RDS cluster instances
resource "aws_rds_cluster_instance" "main" {
  count = 2

  identifier         = "${var.environment}-aurora-instance-${count.index + 1}"
  cluster_identifier = aws_rds_cluster.main.id
  instance_class     = var.db_instance_class
  engine             = aws_rds_cluster.main.engine
  engine_version     = aws_rds_cluster.main.engine_version

  db_parameter_group_name = aws_db_parameter_group.main.name
  
  monitoring_role_arn = aws_iam_role.rds_enhanced_monitoring.arn
  monitoring_interval = 1

  performance_insights_enabled          = true
  performance_insights_retention_period = 7
  
  auto_minor_version_upgrade = true
  
  tags = {
    Name        = "${var.environment}-aurora-instance-${count.index + 1}"
    Environment = var.environment
  }
}

# Security group for RDS
resource "aws_security_group" "rds" {
  name        = "${var.environment}-rds-sg"
  description = "Security group for RDS cluster"
  vpc_id      = vpc_id

  ingress {
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.app.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name        = "${var.environment}-rds-sg"
    Environment = var.environment
  }
}

# CloudWatch alarms for RDS monitoring
resource "aws_cloudwatch_metric_alarm" "rds_cpu" {
  alarm_name          = "${var.environment}-rds-cpu-utilization"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "CPUUtilization"
  namespace           = "AWS/RDS"
  period              = "300"
  statistic           = "Average"
  threshold           = "80"
  alarm_description   = "RDS CPU utilization is too high"
  alarm_actions       = [aws_sns_topic.alerts.arn]

  dimensions = {
    DBClusterIdentifier = aws_rds_cluster.main.cluster_identifier
  }
}

# Outputs
output "rds_endpoint" {
  description = "RDS cluster endpoint"
  value       = aws_rds_cluster.main.endpoint
}

output "rds_reader_endpoint" {
  description = "RDS cluster reader endpoint"
  value       = aws_rds_cluster.main.reader_endpoint
}

output "db_security_group_id" {
  description = "Security group ID for RDS"
  value       = aws_security_group.rds.id
}

output "monitoring_role_arn" {
  description = "ARN of RDS monitoring IAM role"
  value       = aws_iam_role.rds_enhanced_monitoring.arn
}