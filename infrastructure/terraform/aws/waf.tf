# AWS WAF configuration for Matter platform
# Provider version: hashicorp/aws ~> 4.0

# WAF Web ACL for CloudFront distribution
resource "aws_wafv2_web_acl" "matter_platform" {
  name        = "matter-platform-waf-${var.environment}"
  description = "WAF rules for Matter platform protection"
  scope       = "CLOUDFRONT"

  default_action {
    allow {}
  }

  # Rate-based rule to prevent DDoS attacks
  rule {
    name     = "RateLimitRule"
    priority = local.waf_rule_priority_base

    override_action {
      none {}
    }

    statement {
      rate_based_statement {
        limit              = local.waf_rate_limit
        aggregate_key_type = "IP"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name               = "RateLimitMetric"
      sampled_requests_enabled  = true
    }
  }

  # AWS Managed Rules for common threats
  rule {
    name     = "AWSManagedRulesCommonRuleSet"
    priority = local.waf_rule_priority_base + 1

    override_action {
      none {}
    }

    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesCommonRuleSet"
        vendor_name = "AWS"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name               = "AWSManagedRulesCommonRuleSetMetric"
      sampled_requests_enabled  = true
    }
  }

  # SQL Injection protection
  rule {
    name     = "AWSManagedRulesSQLiRuleSet"
    priority = local.waf_rule_priority_base + 2

    override_action {
      none {}
    }

    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesSQLiRuleSet"
        vendor_name = "AWS"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name               = "SQLiRuleMetric"
      sampled_requests_enabled  = true
    }
  }

  # XSS protection
  rule {
    name     = "AWSManagedRulesKnownBadInputsRuleSet"
    priority = local.waf_rule_priority_base + 3

    override_action {
      none {}
    }

    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesKnownBadInputsRuleSet"
        vendor_name = "AWS"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name               = "KnownBadInputsMetric"
      sampled_requests_enabled  = true
    }
  }

  # Size constraint rule
  rule {
    name     = "SizeConstraintRule"
    priority = local.waf_rule_priority_base + 4

    override_action {
      none {}
    }

    statement {
      size_constraint_statement {
        comparison_operator = "GT"
        size               = local.waf_max_request_size
        field_to_match {
          body {}
        }
        text_transformation {
          priority = 1
          type     = "NONE"
        }
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name               = "SizeConstraintMetric"
      sampled_requests_enabled  = true
    }
  }

  # IP reputation rule
  rule {
    name     = "AWSManagedRulesAmazonIpReputationList"
    priority = local.waf_rule_priority_base + 5

    override_action {
      none {}
    }

    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesAmazonIpReputationList"
        vendor_name = "AWS"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name               = "IpReputationMetric"
      sampled_requests_enabled  = true
    }
  }

  tags = merge(var.tags, {
    Name        = "matter-platform-waf-${var.environment}"
    Environment = var.environment
    Security    = "High"
  })

  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name               = "MatterPlatformWAFMetric"
    sampled_requests_enabled  = true
  }
}

# WAF logging configuration
resource "aws_wafv2_web_acl_logging_configuration" "matter_platform" {
  log_destination_configs = [aws_cloudwatch_log_group.waf_logs.arn]
  resource_arn           = aws_wafv2_web_acl.matter_platform.arn

  redacted_fields {
    single_header {
      name = "authorization"
    }
    single_header {
      name = "cookie"
    }
  }

  logging_filter {
    default_behavior = "DROP"

    filter {
      behavior = "KEEP"
      condition {
        action_condition {
          action = "BLOCK"
        }
      }
      requirement = "MEETS_ANY"
    }
  }
}

# CloudWatch log group for WAF logs
resource "aws_cloudwatch_log_group" "waf_logs" {
  name              = "/aws/waf/${var.environment}/matter-platform"
  retention_in_days = 90

  tags = merge(var.tags, {
    Name        = "matter-platform-waf-logs-${var.environment}"
    Environment = var.environment
    Security    = "High"
  })
}

# WAF association with CloudFront distribution
resource "aws_wafv2_web_acl_association" "cloudfront" {
  resource_arn = data.aws_cloudfront_distribution.matter_platform.arn
  web_acl_arn  = aws_wafv2_web_acl.matter_platform.arn
}

# Local variables
locals {
  waf_rate_limit         = 100
  waf_block_period       = 300
  waf_max_request_size   = 10240
  waf_rule_priority_base = 100
}

# Outputs
output "waf_web_acl_id" {
  description = "WAF Web ACL ID"
  value       = aws_wafv2_web_acl.matter_platform.id
}

output "waf_web_acl_arn" {
  description = "WAF Web ACL ARN"
  value       = aws_wafv2_web_acl.matter_platform.arn
}

output "waf_logging_configuration" {
  description = "WAF logging configuration"
  value = {
    log_group_name = aws_cloudwatch_log_group.waf_logs.name
    log_group_arn  = aws_cloudwatch_log_group.waf_logs.arn
  }
}

# Data source for CloudFront distribution
data "aws_cloudfront_distribution" "matter_platform" {
  id = data.terraform_remote_state.cloudfront.outputs.cloudfront_distribution_id
}