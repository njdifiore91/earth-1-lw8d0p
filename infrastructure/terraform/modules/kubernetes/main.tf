# Provider configuration
terraform {
  required_providers {
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "~> 2.0"
    }
    helm = {
      source  = "hashicorp/helm"
      version = "~> 2.0"
    }
  }
}

# Kubernetes provider configuration
provider "kubernetes" {
  host                   = data.terraform_remote_state.eks.outputs.cluster_endpoint
  cluster_ca_certificate = base64decode(data.terraform_remote_state.eks.outputs.cluster_certificate_authority_data)
  exec {
    api_version = "client.authentication.k8s.io/v1beta1"
    args        = ["eks", "get-token", "--cluster-name", data.terraform_remote_state.eks.outputs.cluster_id]
    command     = "aws"
  }
}

# Helm provider configuration
provider "helm" {
  kubernetes {
    host                   = data.terraform_remote_state.eks.outputs.cluster_endpoint
    cluster_ca_certificate = base64decode(data.terraform_remote_state.eks.outputs.cluster_certificate_authority_data)
    exec {
      api_version = "client.authentication.k8s.io/v1beta1"
      args        = ["eks", "get-token", "--cluster-name", data.terraform_remote_state.eks.outputs.cluster_id]
      command     = "aws"
    }
  }
}

# Application namespace
resource "kubernetes_namespace" "application" {
  metadata {
    name = "matter-platform"
    labels = {
      environment      = var.environment
      terraform       = "true"
      app             = "matter-satellite-platform"
      security-zone   = "restricted"
      compliance-level = "high"
    }
  }
}

# Resource quota for application namespace
resource "kubernetes_resource_quota" "application" {
  metadata {
    name      = "matter-platform-quota"
    namespace = kubernetes_namespace.application.metadata[0].name
  }

  spec {
    hard = {
      "requests.cpu"    = "8"
      "requests.memory" = "16Gi"
      "limits.cpu"      = "16"
      "limits.memory"   = "32Gi"
      "pods"           = "50"
      "services"       = "20"
    }
  }
}

# Network policy for application namespace
resource "kubernetes_network_policy" "application" {
  metadata {
    name      = "matter-platform-network-policy"
    namespace = kubernetes_namespace.application.metadata[0].name
  }

  spec {
    pod_selector {}

    ingress {
      from {
        namespace_selector {
          match_labels = {
            "kubernetes.io/metadata.name" = "ingress-nginx"
          }
        }
      }
    }

    egress {
      to {
        ip_block {
          cidr = "0.0.0.0/0"
          except = [
            "169.254.169.254/32" # EC2 metadata endpoint
          ]
        }
      }
    }

    policy_types = ["Ingress", "Egress"]
  }
}

# Service account for application workloads
resource "kubernetes_service_account" "application" {
  metadata {
    name      = "matter-platform-sa"
    namespace = kubernetes_namespace.application.metadata[0].name
    labels = {
      environment = var.environment
      terraform  = "true"
      app        = "matter-satellite-platform"
    }
    annotations = {
      "eks.amazonaws.com/role-arn" = aws_iam_role.application.arn
    }
  }
}

# Monitoring namespace
resource "kubernetes_namespace" "monitoring" {
  metadata {
    name = "monitoring"
    labels = {
      environment      = var.environment
      terraform       = "true"
      app             = "matter-satellite-platform"
      security-zone   = "restricted"
      compliance-level = "high"
    }
  }
}

# Prometheus stack deployment
resource "helm_release" "prometheus_stack" {
  name       = "prometheus-stack"
  namespace  = kubernetes_namespace.monitoring.metadata[0].name
  repository = "https://prometheus-community.github.io/helm-charts"
  chart      = "kube-prometheus-stack"
  version    = "45.7.1"

  values = [
    file("${path.module}/monitoring-values.yaml")
  ]

  set {
    name  = "grafana.adminPassword"
    value = var.grafana_admin_password
  }

  depends_on = [
    kubernetes_namespace.monitoring
  ]
}

# Outputs
output "namespace_name" {
  description = "The name of the created application namespace"
  value       = kubernetes_namespace.application.metadata[0].name
}

output "service_account_name" {
  description = "The name of the created service account"
  value       = kubernetes_service_account.application.metadata[0].name
}

output "monitoring_endpoint" {
  description = "The endpoint for accessing Grafana monitoring"
  value       = "https://grafana.${var.domain_name}"
}

# Variables
variable "environment" {
  description = "Deployment environment (dev/staging/prod)"
  type        = string
}

variable "domain_name" {
  description = "Base domain name for the platform"
  type        = string
}

variable "grafana_admin_password" {
  description = "Admin password for Grafana"
  type        = string
  sensitive   = true
}