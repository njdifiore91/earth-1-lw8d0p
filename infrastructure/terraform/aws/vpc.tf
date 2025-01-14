# AWS Provider configuration
terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 4.0"
    }
  }
}

# VPC Module Configuration
module "networking" {
  source = "../modules/networking"

  # Core VPC Configuration
  vpc_cidr            = var.vpc_cidr
  availability_zones  = var.availability_zones
  environment         = var.environment

  # Enhanced Features
  enable_flow_logs    = true
  enable_vpc_endpoints = true
  enable_nacls        = true

  # Subnet Configuration
  public_subnets = [
    for i, az in var.availability_zones : cidrsubnet(var.vpc_cidr, 4, i)
  ]
  private_subnets = [
    for i, az in var.availability_zones : cidrsubnet(var.vpc_cidr, 4, i + length(var.availability_zones))
  ]
  database_subnets = [
    for i, az in var.availability_zones : cidrsubnet(var.vpc_cidr, 4, i + (2 * length(var.availability_zones)))
  ]

  # VPC Endpoint Configuration
  vpc_endpoint_services = [
    "s3",
    "dynamodb",
    "secretsmanager",
    "ecr.api",
    "ecr.dkr",
    "logs",
    "monitoring"
  ]

  # Enhanced Monitoring Configuration
  flow_log_settings = {
    traffic_type         = "ALL"
    log_destination_type = "cloudwatch-logs"
    retention_in_days    = 30
  }

  # Security Configuration
  enable_nat_gateway     = true
  single_nat_gateway     = false
  one_nat_gateway_per_az = true

  # DNS Configuration
  enable_dns_hostnames = true
  enable_dns_support   = true

  # Resource Tags
  tags = merge(
    {
      Name               = "${var.environment}-vpc"
      Environment        = var.environment
      Terraform         = "true"
      Service           = "matter-platform"
      SecurityZone      = "restricted"
      DataClassification = "confidential"
      CostCenter        = "platform-infrastructure"
    },
    {
      "kubernetes.io/cluster/${var.environment}-eks" = "shared"
    }
  )
}

# VPC Outputs
output "vpc_id" {
  description = "The ID of the VPC"
  value       = module.networking.vpc_id
}

output "public_subnet_ids" {
  description = "List of public subnet IDs"
  value       = module.networking.public_subnet_ids
}

output "private_subnet_ids" {
  description = "List of private subnet IDs"
  value       = module.networking.private_subnet_ids
}

output "database_subnet_ids" {
  description = "List of database subnet IDs"
  value       = module.networking.database_subnet_ids
}

output "vpc_flow_log_group" {
  description = "Name of the CloudWatch log group for VPC flow logs"
  value       = module.networking.vpc_flow_log_group
}

output "nat_gateway_ips" {
  description = "List of NAT Gateway public IPs"
  value       = module.networking.nat_gateway_ips
}

output "vpc_endpoint_ids" {
  description = "Map of VPC Endpoint IDs"
  value       = module.networking.vpc_endpoint_ids
}

output "vpc_cidr_block" {
  description = "The CIDR block of the VPC"
  value       = var.vpc_cidr
}

output "availability_zones" {
  description = "List of availability zones used"
  value       = var.availability_zones
}