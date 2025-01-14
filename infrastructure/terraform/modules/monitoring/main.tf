# Monitoring Infrastructure Module for Matter Platform
# Terraform AWS Provider ~> 4.0
# Terraform Kubernetes Provider ~> 2.0
# Terraform Helm Provider ~> 2.0

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
    helm = {
      source  = "hashicorp/helm"
      version = "~> 2.0"
    }
  }
}

# Create monitoring namespace with resource quotas and security policies
resource "kubernetes_namespace" "monitoring" {
  metadata {
    name = "monitoring"
    labels = {
      name        = "monitoring"
      environment = var.environment
      project     = "matter-platform"
    }
  }

  spec {
    finalizers = ["kubernetes"]
  }
}

# Security group for monitoring components
resource "aws_security_group" "monitoring" {
  name_prefix = "monitoring-${var.environment}"
  vpc_id      = data.aws_vpc.main.id

  ingress {
    from_port       = 9090
    to_port         = 9090
    protocol        = "tcp"
    security_groups = [data.aws_security_group.eks_worker.id]
    description     = "Prometheus server access"
  }

  ingress {
    from_port       = 3000
    to_port         = 3000
    protocol        = "tcp"
    security_groups = [data.aws_security_group.eks_worker.id]
    description     = "Grafana dashboard access"
  }

  ingress {
    from_port       = 9093
    to_port         = 9093
    protocol        = "tcp"
    security_groups = [data.aws_security_group.eks_worker.id]
    description     = "AlertManager access"
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name        = "monitoring-${var.environment}"
    Environment = var.environment
    Project     = "matter-platform"
  }
}

# IAM role for monitoring service accounts
resource "aws_iam_role" "monitoring" {
  name = "monitoring-${var.environment}"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRoleWithWebIdentity"
        Effect = "Allow"
        Principal = {
          Federated = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:oidc-provider/${data.aws_eks_cluster.main.identity[0].oidc[0].issuer}"
        }
        Condition = {
          StringEquals = {
            "${data.aws_eks_cluster.main.identity[0].oidc[0].issuer}:sub" = "system:serviceaccount:monitoring:prometheus-server"
          }
        }
      }
    ]
  })
}

# Storage class for monitoring persistence
resource "kubernetes_storage_class" "monitoring" {
  metadata {
    name = "monitoring-storage"
  }

  storage_provisioner = "ebs.csi.aws.com"
  reclaim_policy     = "Retain"
  parameters = {
    type      = "gp3"
    encrypted = "true"
  }
}

# Prometheus Helm release
resource "helm_release" "prometheus" {
  name       = "prometheus"
  repository = "https://prometheus-community.github.io/helm-charts"
  chart      = "prometheus"
  version    = "15.0.0"
  namespace  = kubernetes_namespace.monitoring.metadata[0].name

  values = [
    templatefile("${path.module}/templates/prometheus-values.yaml", {
      storage_class = kubernetes_storage_class.monitoring.metadata[0].name
      retention     = "30d"
      environment   = var.environment
    })
  ]

  set {
    name  = "server.persistentVolume.size"
    value = "100Gi"
  }

  set {
    name  = "server.resources.requests.cpu"
    value = "1000m"
  }

  set {
    name  = "server.resources.requests.memory"
    value = "4Gi"
  }
}

# Grafana Helm release
resource "helm_release" "grafana" {
  name       = "grafana"
  repository = "https://grafana.github.io/helm-charts"
  chart      = "grafana"
  version    = "6.32.0"
  namespace  = kubernetes_namespace.monitoring.metadata[0].name

  values = [
    templatefile("${path.module}/templates/grafana-values.yaml", {
      storage_class = kubernetes_storage_class.monitoring.metadata[0].name
      environment   = var.environment
    })
  ]

  set {
    name  = "persistence.enabled"
    value = "true"
  }

  set {
    name  = "persistence.size"
    value = "10Gi"
  }

  set_sensitive {
    name  = "adminPassword"
    value = random_password.grafana_admin.result
  }
}

# AlertManager Helm release
resource "helm_release" "alertmanager" {
  name       = "alertmanager"
  repository = "https://prometheus-community.github.io/helm-charts"
  chart      = "alertmanager"
  version    = "0.19.0"
  namespace  = kubernetes_namespace.monitoring.metadata[0].name

  values = [
    templatefile("${path.module}/templates/alertmanager-values.yaml", {
      environment = var.environment
    })
  ]
}

# Generate secure Grafana admin password
resource "random_password" "grafana_admin" {
  length  = 16
  special = true
}

# ConfigMap for custom Prometheus rules
resource "kubernetes_config_map" "prometheus_rules" {
  metadata {
    name      = "prometheus-rules"
    namespace = kubernetes_namespace.monitoring.metadata[0].name
  }

  data = {
    "sla.rules" = file("${path.module}/rules/sla.yaml")
    "alerts.rules" = file("${path.module}/rules/alerts.yaml")
  }
}

# Outputs
output "prometheus_endpoint" {
  value = {
    endpoint = "http://prometheus-server.${kubernetes_namespace.monitoring.metadata[0].name}.svc.cluster.local"
    port     = 9090
  }
}

output "grafana_endpoint" {
  value = {
    endpoint       = "http://grafana.${kubernetes_namespace.monitoring.metadata[0].name}.svc.cluster.local"
    admin_password = random_password.grafana_admin.result
  }
  sensitive = true
}

output "alertmanager_endpoint" {
  value = {
    endpoint = "http://alertmanager.${kubernetes_namespace.monitoring.metadata[0].name}.svc.cluster.local"
    config = {
      route = {
        group_by = ["alertname", "cluster", "service"]
      }
      receivers = [
        {
          name = "default"
        }
      ]
    }
  }
}