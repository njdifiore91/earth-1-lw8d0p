#!/bin/bash

# Matter Platform Monitoring Stack Setup Script
# Version: 1.0.0
# Description: Automated deployment and configuration of monitoring infrastructure
# Dependencies: kubectl v1.25+, helm 3.x

set -euo pipefail

# Global variables
readonly NAMESPACE="matter-platform"
readonly PROMETHEUS_VERSION="v2.45.0"
readonly GRAFANA_VERSION="9.5.0"
readonly RETRY_ATTEMPTS=3
readonly HEALTH_CHECK_TIMEOUT=300

# Color codes for output
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly NC='\033[0m'

# Logging functions
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check prerequisites and validate environment
check_prerequisites() {
    log_info "Checking prerequisites..."

    # Validate kubectl version
    if ! kubectl version --client --short | grep -q "v1.25"; then
        log_error "kubectl version 1.25+ is required"
        return 1
    fi

    # Validate helm version
    if ! helm version --short | grep -q "v3"; then
        log_error "helm v3.x is required"
        return 1
    }

    # Verify cluster connectivity
    if ! kubectl cluster-info &>/dev/null; then
        log_error "Unable to connect to Kubernetes cluster"
        return 1
    }

    # Validate configuration files
    local config_files=("../config/prometheus/prometheus.yml" "../config/grafana/datasource.yml")
    for file in "${config_files[@]}"; do
        if [[ ! -f "$file" ]]; then
            log_error "Configuration file not found: $file"
            return 1
        fi
    done

    # Verify storage class availability
    if ! kubectl get storageclass &>/dev/null; then
        log_error "No storage class available in cluster"
        return 1
    }

    log_info "Prerequisites check completed successfully"
    return 0
}

# Setup Prometheus with enhanced security and HA
setup_prometheus() {
    log_info "Setting up Prometheus ${PROMETHEUS_VERSION}..."

    # Add and update Helm repositories
    helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
    helm repo update

    # Create Prometheus ConfigMap
    kubectl create configmap prometheus-config \
        --from-file=../config/prometheus/prometheus.yml \
        -n "${NAMESPACE}" --dry-run=client -o yaml | kubectl apply -f -

    # Deploy Prometheus with custom values
    helm upgrade --install prometheus prometheus-community/prometheus \
        --namespace "${NAMESPACE}" \
        --version "${PROMETHEUS_VERSION#v}" \
        --set server.persistentVolume.size=50Gi \
        --set server.retention=15d \
        --set server.securityContext.runAsNonRoot=true \
        --set server.securityContext.runAsUser=65534 \
        --values - <<EOF
server:
  podAntiAffinity:
    preferredDuringSchedulingIgnoredDuringExecution:
    - weight: 100
      podAffinityTerm:
        labelSelector:
          matchExpressions:
          - key: app
            operator: In
            values:
            - prometheus
        topologyKey: kubernetes.io/hostname
  resources:
    requests:
      cpu: 500m
      memory: 2Gi
    limits:
      cpu: 1000m
      memory: 4Gi
EOF

    # Wait for Prometheus deployment
    kubectl rollout status deployment/prometheus-server -n "${NAMESPACE}" --timeout="${HEALTH_CHECK_TIMEOUT}s"

    log_info "Prometheus setup completed"
    return 0
}

# Setup Grafana with automated provisioning
setup_grafana() {
    log_info "Setting up Grafana ${GRAFANA_VERSION}..."

    # Add and update Helm repositories
    helm repo add grafana https://grafana.github.io/helm-charts
    helm repo update

    # Create Grafana datasource ConfigMap
    kubectl create configmap grafana-datasources \
        --from-file=../config/grafana/datasource.yml \
        -n "${NAMESPACE}" --dry-run=client -o yaml | kubectl apply -f -

    # Generate secure admin password
    local grafana_password
    grafana_password=$(openssl rand -base64 32)

    # Create Grafana secret
    kubectl create secret generic grafana-admin-credentials \
        --from-literal=admin-password="${grafana_password}" \
        -n "${NAMESPACE}" --dry-run=client -o yaml | kubectl apply -f -

    # Deploy Grafana with custom values
    helm upgrade --install grafana grafana/grafana \
        --namespace "${NAMESPACE}" \
        --version "${GRAFANA_VERSION}" \
        --set persistence.enabled=true \
        --set persistence.size=10Gi \
        --set adminPassword="${grafana_password}" \
        --values - <<EOF
securityContext:
  runAsUser: 472
  runAsGroup: 472
  fsGroup: 472
resources:
  requests:
    cpu: 200m
    memory: 512Mi
  limits:
    cpu: 500m
    memory: 1Gi
deploymentStrategy:
  type: RollingUpdate
service:
  type: ClusterIP
ingress:
  enabled: true
  annotations:
    kubernetes.io/ingress-class: nginx
    cert-manager.io/cluster-issuer: letsencrypt-prod
EOF

    # Wait for Grafana deployment
    kubectl rollout status deployment/grafana -n "${NAMESPACE}" --timeout="${HEALTH_CHECK_TIMEOUT}s"

    log_info "Grafana setup completed"
    log_info "Grafana admin password stored in secret: grafana-admin-credentials"
    return 0
}

# Verify monitoring stack deployment
verify_monitoring() {
    log_info "Verifying monitoring stack deployment..."

    # Check Prometheus health
    local prometheus_pod
    prometheus_pod=$(kubectl get pods -n "${NAMESPACE}" -l app=prometheus -o jsonpath='{.items[0].metadata.name}')
    
    if ! kubectl exec "${prometheus_pod}" -n "${NAMESPACE}" -- wget -qO- http://localhost:9090/-/healthy; then
        log_error "Prometheus health check failed"
        return 1
    fi

    # Check Prometheus targets
    if ! kubectl exec "${prometheus_pod}" -n "${NAMESPACE}" -- wget -qO- http://localhost:9090/api/v1/targets | grep -q "up"; then
        log_error "Prometheus targets not found"
        return 1
    }

    # Check Grafana health
    local grafana_pod
    grafana_pod=$(kubectl get pods -n "${NAMESPACE}" -l app.kubernetes.io/name=grafana -o jsonpath='{.items[0].metadata.name}')
    
    if ! kubectl exec "${grafana_pod}" -n "${NAMESPACE}" -- wget -qO- http://localhost:3000/api/health | grep -q "ok"; then
        log_error "Grafana health check failed"
        return 1
    }

    log_info "Monitoring stack verification completed successfully"
    return 0
}

# Main execution
main() {
    log_info "Starting monitoring stack setup..."

    # Create namespace if it doesn't exist
    kubectl create namespace "${NAMESPACE}" --dry-run=client -o yaml | kubectl apply -f -

    # Execute setup steps with retry logic
    local functions=("check_prerequisites" "setup_prometheus" "setup_grafana" "verify_monitoring")
    
    for func in "${functions[@]}"; do
        local attempts=0
        while (( attempts < RETRY_ATTEMPTS )); do
            if "${func}"; then
                break
            else
                attempts=$((attempts + 1))
                if (( attempts == RETRY_ATTEMPTS )); then
                    log_error "Failed to execute ${func} after ${RETRY_ATTEMPTS} attempts"
                    exit 1
                fi
                log_warn "Retrying ${func} (attempt $((attempts + 1))/${RETRY_ATTEMPTS})"
                sleep 5
            fi
        done
    done

    log_info "Monitoring stack setup completed successfully"
}

# Execute main function
main