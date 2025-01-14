# Matter Platform - Main Infrastructure Configuration
# Terraform AWS Provider v4.0
# Kubernetes Provider v2.0

terraform {
  required_version = ">= 1.0"
  
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 4.0"
    }
    kubernetes = {
      source  = "hashicorp/kubernetes" 
      version = "~> 2.0"
    }
  }

  backend "s3" {
    bucket         = "matter-platform-terraform-state"
    key            = "infrastructure/terraform.tfstate"
    region         = "us-east-1"
    encrypt        = true
    dynamodb_table = "matter-platform-terraform-locks"
  }
}

provider "aws" {
  region = var.region

  default_tags {
    tags = merge(var.tags, {
      Project     = "matter-platform"
      Environment = var.environment
      ManagedBy   = "terraform"
    })
  }
}

# Core Networking Infrastructure
module "networking" {
  source = "../modules/networking"

  environment         = var.environment
  vpc_cidr           = var.vpc_cidr
  availability_zones = var.availability_zones
  
  enable_nat_gateway = true
  single_nat_gateway = var.environment != "prod"
  
  enable_vpn_gateway = var.environment == "prod"
  
  tags = var.tags
}

# Security Infrastructure
module "security" {
  source = "../modules/security"

  environment              = var.environment
  vpc_id                  = module.networking.vpc_id
  kms_key_deletion_window = var.kms_key_deletion_window
  enable_waf              = var.enable_waf
  ssl_policy              = var.ssl_policy
  
  tags = var.tags
}

# Database Infrastructure
module "database" {
  source = "../modules/database"

  environment               = var.environment
  vpc_id                   = module.networking.vpc_id
  subnet_ids               = module.networking.private_subnet_ids
  kms_key_id               = module.security.kms_key_id
  security_group_ids       = module.security.security_group_ids
  
  # RDS Configuration
  db_instance_class        = var.db_instance_class
  multi_az                 = var.rds_multi_az
  backup_retention_period  = var.backup_retention_period
  enable_encryption        = var.enable_encryption
  enable_enhanced_monitoring = var.enable_enhanced_monitoring
  monitoring_interval      = var.monitoring_interval
  
  # Redis Configuration
  redis_node_type         = var.redis_node_type
  redis_cluster_mode      = var.redis_cluster_mode
  
  tags = var.tags
}

# EKS Cluster
module "eks" {
  source = "../modules/eks"

  environment         = var.environment
  cluster_version     = var.eks_cluster_version
  vpc_id             = module.networking.vpc_id
  subnet_ids         = module.networking.private_subnet_ids
  kms_key_id         = module.security.kms_key_id
  
  node_groups = {
    application = {
      desired_size = 3
      min_size    = 2
      max_size    = 10
      instance_types = ["t3.large"]
      capacity_type  = "ON_DEMAND"
    }
    processing = {
      desired_size = 2
      min_size    = 1
      max_size    = 5
      instance_types = ["c6i.xlarge"]
      capacity_type  = "SPOT"
    }
  }
  
  tags = var.tags
}

# Route53 and ACM
module "dns" {
  source = "../modules/dns"

  domain_name = var.domain_name
  environment = var.environment
  vpc_id      = module.networking.vpc_id
  
  tags = var.tags
}

# CloudWatch Monitoring
module "monitoring" {
  source = "../modules/monitoring"

  environment     = var.environment
  eks_cluster_id  = module.eks.cluster_id
  rds_cluster_id  = module.database.rds_cluster_id
  redis_cluster_id = module.database.redis_cluster_id
  
  alarm_actions   = ["arn:aws:sns:${var.region}:${data.aws_caller_identity.current.account_id}:${var.environment}-alerts"]
  
  tags = var.tags
}

# Outputs
output "vpc_id" {
  description = "VPC ID"
  value       = module.networking.vpc_id
}

output "eks_cluster_endpoint" {
  description = "EKS cluster endpoint"
  value = {
    endpoint             = module.eks.cluster_endpoint
    certificate_authority = module.eks.cluster_certificate_authority
  }
  sensitive = true
}

output "rds_cluster_endpoint" {
  description = "RDS cluster endpoint"
  value = {
    endpoint = module.database.rds_endpoint
    port     = module.database.rds_port
  }
  sensitive = true
}

output "elasticache_endpoint" {
  description = "ElastiCache endpoint"
  value = {
    endpoint = module.database.redis_endpoint
    port     = module.database.redis_port
  }
  sensitive = true
}

# Data Sources
data "aws_caller_identity" "current" {}