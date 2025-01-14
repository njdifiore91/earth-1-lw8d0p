#!/usr/bin/env bash

# Matter Platform Deployment Script
# Version: 1.0.0
# Description: Advanced deployment automation script with zero-downtime deployment,
# comprehensive validation, and automated rollback capabilities

set -euo pipefail
IFS=$'\n\t'

# Global Configuration
readonly ENVIRONMENTS=("development" "staging" "production")
readonly REQUIRED_TOOLS=("kubectl" "helm" "aws" "terraform")
readonly LOG_FILE="/var/log/matter/deployment.log"
readonly TIMEOUT=300
readonly HEALTH_CHECK_INTERVAL=10
readonly MAX_RETRY_ATTEMPTS=3

# Color codes for output
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly NC='\033[0m'

# Logging setup
setup_logging() {
    local log_dir
    log_dir=$(dirname "${LOG_FILE}")
    mkdir -p "${log_dir}"
    exec 1> >(tee -a "${LOG_FILE}")
    exec 2> >(tee -a "${LOG_FILE}" >&2)
}

log() {
    local level=$1
    shift
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] [${level}] $*" 
}

# Prerequisites validation
check_prerequisites() {
    log "INFO" "Validating deployment prerequisites..."
    
    # Verify required tools
    for tool in "${REQUIRED_TOOLS[@]}"; do
        if ! command -v "${tool}" >/dev/null 2>&1; then
            log "ERROR" "Required tool not found: ${tool}"
            return 1
        fi
        
        # Version validation for specific tools
        case ${tool} in
            kubectl)
                version=$(kubectl version --client -o json | jq -r '.clientVersion.gitVersion')
                if [[ ! "${version}" =~ v1\.2[5-9]\. ]]; then
                    log "ERROR" "kubectl version must be 1.25+"
                    return 1
                fi
                ;;
            helm)
                version=$(helm version --template='{{.Version}}')
                if [[ ! "${version}" =~ v3\.1[1-9]\. ]]; then
                    log "ERROR" "helm version must be 3.11+"
                    return 1
                fi
                ;;
        esac
    done

    # Validate AWS credentials
    if ! aws sts get-caller-identity >/dev/null 2>&1; then
        log "ERROR" "Invalid AWS credentials"
        return 1
    }

    # Verify cluster connectivity
    if ! kubectl cluster-info >/dev/null 2>&1; then
        log "ERROR" "Cannot connect to Kubernetes cluster"
        return 1
    }

    # Validate required secrets
    if ! kubectl get secret -n matter-platform api-gateway-secrets >/dev/null 2>&1; then
        log "ERROR" "Required secrets not found"
        return 1
    }

    log "INFO" "Prerequisites validation completed successfully"
    return 0
}

# Infrastructure deployment
deploy_infrastructure() {
    local environment=$1
    local version=$2
    
    log "INFO" "Deploying infrastructure for environment: ${environment}"

    # Pre-deployment security scan
    log "INFO" "Running security scans..."
    if ! terraform plan -security-scan -out=tfplan; then
        log "ERROR" "Security scan failed"
        return 1
    }

    # Initialize Terraform
    if ! terraform init -backend-config="environment=${environment}"; then
        log "ERROR" "Terraform initialization failed"
        return 1
    }

    # Apply infrastructure changes
    if ! terraform apply -auto-approve tfplan; then
        log "ERROR" "Infrastructure deployment failed"
        terraform destroy -target=module.new_resources -auto-approve
        return 1
    }

    # Update kubeconfig
    aws eks update-kubeconfig --name "matter-${environment}" --role-arn "arn:aws:iam::ACCOUNT_ID:role/matter-platform-role"

    log "INFO" "Infrastructure deployment completed successfully"
    return 0
}

# Service deployment
deploy_services() {
    local environment=$1
    local version=$2
    
    log "INFO" "Deploying services for environment: ${environment}"

    # Update Helm repositories
    helm repo update

    # Deploy monitoring stack first
    log "INFO" "Deploying monitoring stack..."
    helm upgrade --install monitoring prometheus-community/kube-prometheus-stack \
        --namespace monitoring \
        --create-namespace \
        --values monitoring-values.yaml

    # Deploy core services
    log "INFO" "Deploying core services..."
    
    # API Gateway deployment
    kubectl apply -f infrastructure/kubernetes/api-gateway/deployment.yaml
    
    # Auth Service deployment
    kubectl apply -f infrastructure/kubernetes/auth-service/deployment.yaml
    
    # Deploy main application chart
    helm upgrade --install matter-platform ./infrastructure/helm/matter \
        --namespace matter-platform \
        --create-namespace \
        --set environment="${environment}" \
        --set version="${version}" \
        --wait \
        --timeout "${TIMEOUT}s"

    log "INFO" "Service deployment completed successfully"
    return 0
}

# Deployment validation
validate_deployment() {
    local environment=$1
    local attempts=0
    
    log "INFO" "Validating deployment for environment: ${environment}"

    while [ $attempts -lt $MAX_RETRY_ATTEMPTS ]; do
        # Check pod status
        if ! kubectl get pods -n matter-platform | grep -q "Running"; then
            log "WARN" "Pods not ready, attempt $((attempts+1))/${MAX_RETRY_ATTEMPTS}"
            sleep "${HEALTH_CHECK_INTERVAL}"
            attempts=$((attempts+1))
            continue
        }

        # Validate service endpoints
        if ! curl -sf https://api.matter.com/health > /dev/null; then
            log "WARN" "Service health check failed, attempt $((attempts+1))/${MAX_RETRY_ATTEMPTS}"
            sleep "${HEALTH_CHECK_INTERVAL}"
            attempts=$((attempts+1))
            continue
        }

        # Verify metrics collection
        if ! curl -sf http://localhost:9090/metrics > /dev/null; then
            log "WARN" "Metrics endpoint not ready, attempt $((attempts+1))/${MAX_RETRY_ATTEMPTS}"
            sleep "${HEALTH_CHECK_INTERVAL}"
            attempts=$((attempts+1))
            continue
        }

        log "INFO" "Deployment validation successful"
        return 0
    done

    log "ERROR" "Deployment validation failed after ${MAX_RETRY_ATTEMPTS} attempts"
    return 1
}

# Main deployment function
deploy() {
    local environment=$1
    local version=$2

    setup_logging

    log "INFO" "Starting deployment process for ${environment} environment"

    # Validate environment
    if [[ ! " ${ENVIRONMENTS[*]} " =~ ${environment} ]]; then
        log "ERROR" "Invalid environment: ${environment}"
        return 1
    }

    # Execute deployment steps
    if ! check_prerequisites; then
        log "ERROR" "Prerequisites check failed"
        return 1
    }

    if ! deploy_infrastructure "${environment}" "${version}"; then
        log "ERROR" "Infrastructure deployment failed"
        return 1
    }

    if ! deploy_services "${environment}" "${version}"; then
        log "ERROR" "Service deployment failed"
        return 1
    }

    if ! validate_deployment "${environment}"; then
        log "ERROR" "Deployment validation failed"
        source ./rollback.sh
        rollback "${environment}" "${version}"
        return 1
    }

    log "INFO" "Deployment completed successfully"
    return 0
}

# Script execution
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    if [ "$#" -ne 2 ]; then
        echo "Usage: $0 <environment> <version>"
        exit 1
    }

    deploy "$1" "$2"
fi