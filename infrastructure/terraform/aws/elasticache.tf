# AWS ElastiCache Redis Configuration
# Provider version: ~> 4.0

# Redis Parameter Group for optimized performance
resource "aws_elasticache_parameter_group" "redis_params" {
  family = "redis6.x"
  name   = "${var.environment}-redis-params"

  parameter {
    name  = "maxmemory-policy"
    value = "volatile-lru"
  }

  parameter {
    name  = "timeout"
    value = "300"
  }

  parameter {
    name  = "tcp-keepalive"
    value = "300"
  }

  parameter {
    name  = "maxmemory-samples"
    value = "10"
  }

  parameter {
    name  = "active-defrag-threshold-lower"
    value = "10"
  }

  parameter {
    name  = "active-defrag-threshold-upper"
    value = "100"
  }

  tags = merge(
    local.elasticache_tags,
    {
      Name = "${var.environment}-redis-params"
    }
  )
}

# Redis Subnet Group for Multi-AZ deployment
resource "aws_elasticache_subnet_group" "redis_subnet_group" {
  name       = "${var.environment}-redis-subnets"
  subnet_ids = data.terraform_remote_state.vpc.outputs.private_subnet_ids

  tags = merge(
    local.elasticache_tags,
    {
      Name = "${var.environment}-redis-subnets"
    }
  )
}

# Redis Security Group
resource "aws_security_group" "redis_sg" {
  name        = "${var.environment}-redis-sg"
  description = "Security group for Redis cluster"
  vpc_id      = data.terraform_remote_state.vpc.outputs.vpc_id

  ingress {
    from_port       = 6379
    to_port         = 6379
    protocol        = "tcp"
    security_groups = [aws_security_group.app_sg.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(
    local.elasticache_tags,
    {
      Name = "${var.environment}-redis-sg"
    }
  )
}

# Redis Replication Group with Multi-AZ and encryption
resource "aws_elasticache_replication_group" "redis_cluster" {
  replication_group_id          = "${var.environment}-redis-cluster"
  replication_group_description = "Redis cluster for ${var.environment} environment"
  node_type                    = var.redis_node_type
  number_cache_clusters        = var.redis_cluster_size
  port                         = 6379
  parameter_group_name         = aws_elasticache_parameter_group.redis_params.name
  subnet_group_name            = aws_elasticache_subnet_group.redis_subnet_group.name
  security_group_ids           = [aws_security_group.redis_sg.id]
  
  # High Availability Configuration
  automatic_failover_enabled = true
  multi_az_enabled          = true
  
  # Security Configuration
  at_rest_encryption_enabled = true
  transit_encryption_enabled = true
  
  # Maintenance Configuration
  maintenance_window         = "sun:05:00-sun:09:00"
  snapshot_window           = "00:00-04:00"
  snapshot_retention_limit  = 7
  auto_minor_version_upgrade = true

  # Notifications
  notification_topic_arn = aws_sns_topic.redis_notifications.arn

  tags = local.elasticache_tags
}

# SNS Topic for Redis notifications
resource "aws_sns_topic" "redis_notifications" {
  name = "${var.environment}-redis-notifications"

  tags = local.elasticache_tags
}

# CloudWatch Alarms for Redis monitoring
resource "aws_cloudwatch_metric_alarm" "redis_cpu" {
  alarm_name          = "${var.environment}-redis-cpu-utilization"
  alarm_description   = "Redis cluster CPU utilization"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name        = "CPUUtilization"
  namespace          = "AWS/ElastiCache"
  period             = "300"
  statistic          = "Average"
  threshold          = "75"
  alarm_actions      = [aws_sns_topic.redis_notifications.arn]
  ok_actions         = [aws_sns_topic.redis_notifications.arn]

  dimensions = {
    CacheClusterId = aws_elasticache_replication_group.redis_cluster.id
  }

  tags = local.elasticache_tags
}

# Outputs for other modules to consume
output "redis_endpoint" {
  description = "Redis primary endpoint address"
  value       = aws_elasticache_replication_group.redis_cluster.primary_endpoint_address
}

output "redis_reader_endpoint" {
  description = "Redis reader endpoint address"
  value       = aws_elasticache_replication_group.redis_cluster.reader_endpoint_address
}

output "redis_port" {
  description = "Redis port number"
  value       = aws_elasticache_replication_group.redis_cluster.port
}