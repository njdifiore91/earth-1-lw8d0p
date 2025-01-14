# Environment Configuration
variable "environment" {
  description = "Deployment environment name (dev/staging/prod)"
  type        = string
  
  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "Environment must be one of: dev, staging, prod."
  }
}

# Region Configuration
variable "region" {
  description = "AWS region for resource deployment"
  type        = string
  
  validation {
    condition     = can(regex("^(us|eu|ap|sa|ca|me|af)-(north|south|east|west|central)-[1-9][a-z]?$", var.region))
    error_message = "Invalid AWS region format. Must be a valid AWS region (e.g., us-east-1)."
  }
}

# Networking Configuration
variable "vpc_cidr" {
  description = "CIDR block for the VPC"
  type        = string
  default     = "10.0.0.0/16"
  
  validation {
    condition     = can(cidrhost(var.vpc_cidr, 0))
    error_message = "VPC CIDR must be a valid IPv4 CIDR block."
  }
}

variable "availability_zones" {
  description = "List of AWS availability zones for HA deployment"
  type        = list(string)
  
  validation {
    condition     = length(var.availability_zones) >= 3
    error_message = "At least 3 availability zones required for high availability."
  }
}

# Kubernetes Configuration
variable "eks_cluster_version" {
  description = "EKS cluster version"
  type        = string
  default     = "1.25"
  
  validation {
    condition     = can(regex("^1\\.(2[4-5]|26)$", var.eks_cluster_version))
    error_message = "EKS version must be 1.24, 1.25, or 1.26."
  }
}

# Database Configuration
variable "db_instance_class" {
  description = "RDS instance type"
  type        = string
  default     = "db.r6g.large"
  
  validation {
    condition     = can(regex("^db\\.(t3|r6g|r6i)\\.(large|xlarge|2xlarge)$", var.db_instance_class))
    error_message = "Invalid RDS instance class. Must be a valid production-grade instance type."
  }
}

# Cache Configuration
variable "redis_node_type" {
  description = "ElastiCache node type"
  type        = string
  default     = "cache.r6g.large"
  
  validation {
    condition     = can(regex("^cache\\.(r6g|r6gd)\\.(large|xlarge|2xlarge)$", var.redis_node_type))
    error_message = "Invalid Redis node type. Must be a valid production-grade instance type."
  }
}

# DNS Configuration
variable "domain_name" {
  description = "Domain name for Route53 configuration"
  type        = string
  
  validation {
    condition     = can(regex("^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]\\.[a-z]{2,}$", var.domain_name))
    error_message = "Invalid domain name format."
  }
}

# Resource Tagging
variable "tags" {
  description = "Common resource tags"
  type        = map(string)
  default     = {}
  
  validation {
    condition     = contains(keys(var.tags), "Project") && contains(keys(var.tags), "Environment")
    error_message = "Tags must include 'Project' and 'Environment' keys."
  }
}

# Security Configuration
variable "kms_key_deletion_window" {
  description = "KMS key deletion window in days"
  type        = number
  default     = 30
  
  validation {
    condition     = var.kms_key_deletion_window >= 7 && var.kms_key_deletion_window <= 30
    error_message = "KMS key deletion window must be between 7 and 30 days."
  }
}

variable "backup_retention_period" {
  description = "Backup retention period in days"
  type        = number
  default     = 30
  
  validation {
    condition     = var.backup_retention_period >= 7
    error_message = "Backup retention period must be at least 7 days."
  }
}

variable "enable_waf" {
  description = "Enable AWS WAF for web application security"
  type        = bool
  default     = true
}

# Performance Configuration
variable "rds_multi_az" {
  description = "Enable Multi-AZ deployment for RDS"
  type        = bool
  default     = true
}

variable "redis_cluster_mode" {
  description = "Enable cluster mode for ElastiCache"
  type        = bool
  default     = true
}

# Monitoring Configuration
variable "enable_enhanced_monitoring" {
  description = "Enable enhanced monitoring for RDS"
  type        = bool
  default     = true
}

variable "monitoring_interval" {
  description = "Enhanced monitoring interval in seconds"
  type        = number
  default     = 30
  
  validation {
    condition     = contains([0, 1, 5, 10, 15, 30, 60], var.monitoring_interval)
    error_message = "Monitoring interval must be one of: 0, 1, 5, 10, 15, 30, 60."
  }
}

# Compliance Configuration
variable "enable_encryption" {
  description = "Enable encryption at rest for all supported services"
  type        = bool
  default     = true
}

variable "ssl_policy" {
  description = "SSL policy for HTTPS listeners"
  type        = string
  default     = "ELBSecurityPolicy-TLS-1-2-2017-01"
  
  validation {
    condition     = can(regex("^ELBSecurityPolicy-TLS-1-2-[0-9]{4}-[0-9]{2}$", var.ssl_policy))
    error_message = "Invalid SSL policy. Must be a valid TLS 1.2 or higher policy."
  }
}