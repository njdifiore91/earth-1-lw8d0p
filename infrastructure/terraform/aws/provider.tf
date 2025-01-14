# AWS Provider Configuration for Matter Platform
# Version: aws ~> 4.0
# Version: kubernetes ~> 2.0

terraform {
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
}

# Primary region AWS provider configuration
provider "aws" {
  region = var.region

  # Enhanced security configuration
  assume_role {
    role_arn = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:role/TerraformExecutionRole"
  }

  default_tags {
    tags = merge(var.tags, {
      ManagedBy   = "Terraform"
      Environment = var.environment
      Region      = var.region
    })
  }
}

# Secondary region AWS provider for disaster recovery
provider "aws" {
  alias  = "secondary"
  region = var.region == "us-east-1" ? "us-west-2" : "us-east-1" # Ensure cross-region DR

  assume_role {
    role_arn = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:role/TerraformExecutionRole"
  }

  default_tags {
    tags = merge(var.tags, {
      ManagedBy   = "Terraform"
      Environment = var.environment
      Region      = "secondary"
    })
  }
}

# Data source for current AWS account ID
data "aws_caller_identity" "current" {}

# Data source for EKS cluster authentication
data "aws_eks_cluster" "cluster" {
  name = local.cluster_name
}

data "aws_eks_cluster_auth" "cluster" {
  name = local.cluster_name
}

# Kubernetes provider configuration for EKS management
provider "kubernetes" {
  host                   = data.aws_eks_cluster.cluster.endpoint
  cluster_ca_certificate = base64decode(data.aws_eks_cluster.cluster.certificate_authority[0].data)
  token                  = data.aws_eks_cluster_auth.cluster.token

  # AWS IAM Authenticator configuration
  exec {
    api_version = "client.authentication.k8s.io/v1beta1"
    command     = "aws"
    args = [
      "eks",
      "get-token",
      "--cluster-name",
      local.cluster_name,
      "--region",
      var.region
    ]
  }
}

# Local variables
locals {
  cluster_name = "matter-${var.environment}-eks"
}