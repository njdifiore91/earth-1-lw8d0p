# Network Infrastructure Outputs
output "vpc_id" {
  description = "The ID of the VPC"
  value       = module.vpc.vpc_id
}

output "private_subnet_ids" {
  description = "List of private subnet IDs for service deployment"
  value       = module.vpc.private_subnet_ids
}

# EKS Cluster Outputs
output "eks_cluster_endpoint" {
  description = "Endpoint for EKS control plane access"
  value       = module.eks.cluster_endpoint
  sensitive   = true
}

output "eks_cluster_name" {
  description = "Name of the EKS cluster"
  value       = module.eks.cluster_name
}

output "eks_security_group_id" {
  description = "Security group ID for EKS cluster"
  value       = module.eks.cluster_security_group_id
}

# Database Outputs
output "rds_endpoint" {
  description = "RDS cluster endpoint for database connections"
  value       = module.rds.endpoint
  sensitive   = true
}

output "rds_port" {
  description = "Port number for RDS connections"
  value       = module.rds.port
}

output "rds_security_group_id" {
  description = "Security group ID for RDS access"
  value       = module.rds.security_group_id
}

# Cache Layer Outputs
output "elasticache_endpoint" {
  description = "ElastiCache endpoint for Redis connections"
  value       = module.elasticache.endpoint
  sensitive   = true
}

output "elasticache_security_group_id" {
  description = "Security group ID for ElastiCache access"
  value       = module.elasticache.security_group_id
}

# Content Delivery Outputs
output "cloudfront_distribution_id" {
  description = "ID of the CloudFront distribution"
  value       = aws_cloudfront_distribution.main.id
}

output "cloudfront_domain_name" {
  description = "Domain name of the CloudFront distribution"
  value       = aws_cloudfront_distribution.main.domain_name
}