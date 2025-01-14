# AWS Provider configuration
terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 4.0"
    }
  }
}

# CloudFront Distribution
resource "aws_cloudfront_distribution" "matter_distribution" {
  enabled             = true
  is_ipv6_enabled    = true
  price_class        = "PriceClass_100"
  aliases            = [var.domain_name]
  web_acl_id         = aws_wafv2_web_acl.matter_acl.id
  
  # Access logging configuration
  logging_config {
    include_cookies = true
    bucket         = aws_s3_bucket.logs.bucket_domain_name
    prefix         = "cloudfront/"
  }

  # S3 Origin configuration
  origin {
    domain_name = aws_s3_bucket.static_assets.bucket_regional_domain_name
    origin_id   = "S3-${aws_s3_bucket.static_assets.id}"
    
    origin_shield {
      enabled = true
      region  = "us-east-1"
    }
    
    s3_origin_config {
      origin_access_identity = aws_cloudfront_origin_access_identity.matter_oai.cloudfront_access_identity_path
    }
    
    connection_timeout = 10
    connection_attempts = 3
  }

  # API Origin configuration
  origin {
    domain_name = aws_lb.api.dns_name
    origin_id   = "API-${aws_lb.api.name}"
    
    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "https-only"
      origin_ssl_protocols   = ["TLSv1.2"]
    }
  }

  # Origin failover configuration
  origin_group {
    origin_id = "matter-origin-group"
    
    failover_criteria {
      status_codes = [500, 502, 503, 504]
    }
    
    member {
      origin_id = "S3-${aws_s3_bucket.static_assets.id}"
    }
    
    member {
      origin_id = "S3-${aws_s3_bucket.static_assets_backup.id}"
    }
  }

  # Default cache behavior for static assets
  default_cache_behavior {
    allowed_methods  = ["GET", "HEAD", "OPTIONS"]
    cached_methods   = ["GET", "HEAD"]
    target_origin_id = "S3-${aws_s3_bucket.static_assets.id}"
    
    viewer_protocol_policy = "redirect-to-https"
    min_ttl                = 0
    default_ttl            = 3600
    max_ttl                = 86400
    compress               = true
    
    field_level_encryption_id = aws_cloudfront_field_level_encryption_config.sensitive_data.id
    response_headers_policy_id = aws_cloudfront_response_headers_policy.security_headers.id
    cache_policy_id           = aws_cloudfront_cache_policy.optimized.id
    origin_request_policy_id  = aws_cloudfront_origin_request_policy.s3_origin.id
  }

  # Ordered cache behavior for API endpoints
  ordered_cache_behavior {
    path_pattern     = "/api/*"
    allowed_methods  = ["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"]
    cached_methods   = ["GET", "HEAD"]
    target_origin_id = "API-${aws_lb.api.name}"
    
    viewer_protocol_policy = "https-only"
    min_ttl                = 0
    default_ttl            = 0
    max_ttl                = 0
    compress               = true
    
    cache_policy_id          = aws_cloudfront_cache_policy.api.id
    origin_request_policy_id = aws_cloudfront_origin_request_policy.api_origin.id
  }

  # Custom error responses for SPA routing
  custom_error_response {
    error_code         = 403
    response_code      = 200
    response_page_path = "/index.html"
    error_caching_min_ttl = 10
  }

  custom_error_response {
    error_code         = 404
    response_code      = 200
    response_page_path = "/index.html"
    error_caching_min_ttl = 10
  }

  # SSL/TLS configuration
  viewer_certificate {
    acm_certificate_arn      = aws_acm_certificate.matter_cert.arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }

  # Geo-restriction configuration
  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  tags = var.tags
}

# Origin Access Identity
resource "aws_cloudfront_origin_access_identity" "matter_oai" {
  comment = "OAI for Matter platform static assets - ${var.environment}"
}

# Real-time monitoring configuration
resource "aws_cloudfront_monitoring_subscription" "matter_monitoring" {
  distribution_id = aws_cloudfront_distribution.matter_distribution.id
  
  monitoring_subscription {
    realtime_metrics_subscription_config {
      realtime_metrics_subscription_status = "Enabled"
    }
  }
}

# Outputs
output "cloudfront_distribution_id" {
  value       = aws_cloudfront_distribution.matter_distribution.id
  description = "CloudFront distribution ID for DNS and other service references"
}

output "cloudfront_domain_name" {
  value       = aws_cloudfront_distribution.matter_distribution.domain_name
  description = "CloudFront distribution domain name for DNS configuration"
}