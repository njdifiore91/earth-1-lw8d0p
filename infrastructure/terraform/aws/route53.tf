# AWS Provider configuration
terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 4.0"
    }
  }
}

# Primary hosted zone for Matter platform
resource "aws_route53_zone" "matter_zone" {
  name          = var.domain_name
  comment       = "Matter platform hosted zone - ${var.environment}"
  force_destroy = false

  tags = merge(var.tags, {
    Name       = "matter-zone-${var.environment}"
    ManagedBy  = "terraform"
  })
}

# A record for CloudFront distribution
resource "aws_route53_record" "matter_a" {
  zone_id = aws_route53_zone.matter_zone.zone_id
  name    = var.domain_name
  type    = "A"

  alias {
    name                   = aws_cloudfront_distribution.matter_distribution.domain_name
    zone_id               = aws_cloudfront_distribution.matter_distribution.hosted_zone_id
    evaluate_target_health = true
  }
}

# AAAA record for IPv6 support
resource "aws_route53_record" "matter_aaaa" {
  zone_id = aws_route53_zone.matter_zone.zone_id
  name    = var.domain_name
  type    = "AAAA"

  alias {
    name                   = aws_cloudfront_distribution.matter_distribution.domain_name
    zone_id               = aws_cloudfront_distribution.matter_distribution.hosted_zone_id
    evaluate_target_health = true
  }
}

# Enhanced health check configuration
resource "aws_route53_health_check" "matter_health_check" {
  fqdn              = var.domain_name
  port              = 443
  type              = "HTTPS"
  resource_path     = var.health_check_path
  failure_threshold = "2"
  request_interval  = "10"
  measure_latency   = true
  
  regions = [
    "us-east-1",
    "us-west-2",
    "eu-west-1"
  ]

  enable_sni = true
  
  search_string = "\"status\":\"healthy\""
  inverted      = false

  tags = merge(var.tags, {
    Name      = "matter-healthcheck-${var.environment}"
    ManagedBy = "terraform"
  })
}

# Output the hosted zone ID for reference
output "route53_zone_id" {
  description = "Route53 hosted zone ID for DNS record management"
  value       = aws_route53_zone.matter_zone.zone_id
}

# Output the nameservers for domain delegation
output "route53_nameservers" {
  description = "List of nameservers for domain delegation"
  value       = aws_route53_zone.matter_zone.name_servers
}

# Output the health check ID for monitoring integration
output "health_check_id" {
  description = "Health check ID for monitoring and alerting"
  value       = aws_route53_health_check.matter_health_check.id
}