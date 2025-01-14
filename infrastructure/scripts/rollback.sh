#!/bin/bash

# Matter Platform Rollback Script
# Version: 1.0.0
# Dependencies:
# - kubectl v1.25+
# - helm v3.11+
# - aws-cli v2.0+
# - prometheus-client v2.0+

set -euo pipefail

# Global Variables
readonly ENVIRONMENTS=("development" "staging" "production")
readonly REQUIRED_TOOLS=("kubectl" "helm" "aws" "terraform" "prometheus")
readonly LOG_FILE="/var/log/matter/rollback.log"
readonly METRICS_FILE="/var/log/matter/rollback_metrics.log"
readonly TIMEOUT=300
readonly MAX_RETRIES=3
readonly HEALTH_CHECK_INTERVAL=10

# Logging function
log() {
    local level=$1
    local message=$2
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] [$level] $message" | tee -a "$LOG_FILE"
}

# Error handling
error_handler() {
    local exit_code=$?
    log "ERROR" "An error occurred on line $1 with exit code $exit_code"
    cleanup
    exit $exit_code
}

trap 'error_handler ${LINENO}' ERR

# Initialize logging and metrics
initialize() {
    mkdir -p "$(dirname "$LOG_FILE")" "$(dirname "$METRICS_FILE")"
    touch "$LOG_FILE" "$METRICS_FILE"
    log "INFO" "Rollback script initialized"
}

# Check prerequisites
check_prerequisites() {
    local environment=$1
    log "INFO" "Checking prerequisites for environment: $environment"

    # Verify required tools
    for tool in "${REQUIRED_TOOLS[@]}"; do
        if ! command -v "$tool" &> /dev/null; then
            log "ERROR" "Required tool not found: $tool"
            return 1
        fi
    done

    # Validate AWS credentials
    if ! aws sts get-caller-identity &> /dev/null; then
        log "ERROR" "Invalid AWS credentials"
        return 1
    }

    # Check Kubernetes cluster access
    if ! kubectl cluster-info &> /dev/null; then
        log "ERROR" "Cannot access Kubernetes cluster"
        return 1
    }

    return 0
}

# Kubernetes rollback function
rollback_kubernetes() {
    local namespace=$1
    local deployment=$2
    local revision=$3
    
    log "INFO" "Starting Kubernetes rollback for $deployment to revision $revision"

    # Capture pre-rollback metrics
    kubectl get deployment "$deployment" -n "$namespace" -o json > "/tmp/pre_rollback_${deployment}.json"

    # Execute rollback
    if ! kubectl rollout undo deployment/"$deployment" -n "$namespace" --to-revision="$revision"; then
        log "ERROR" "Failed to rollback deployment $deployment"
        return 1
    }

    # Wait for rollout completion
    if ! kubectl rollout status deployment/"$deployment" -n "$namespace" --timeout="${TIMEOUT}s"; then
        log "ERROR" "Rollback timeout for deployment $deployment"
        return 1
    }

    # Verify health checks
    local retries=0
    while [ $retries -lt $MAX_RETRIES ]; do
        if kubectl get pods -n "$namespace" -l "app=$deployment" -o jsonpath='{.items[*].status.conditions[?(@.type=="Ready")].status}' | grep -q "True"; then
            log "INFO" "Health check passed for $deployment"
            return 0
        fi
        ((retries++))
        sleep "$HEALTH_CHECK_INTERVAL"
    done

    log "ERROR" "Health check failed for $deployment after $MAX_RETRIES attempts"
    return 1
}

# Helm rollback function
rollback_helm() {
    local release_name=$1
    local namespace=$2
    local revision=$3

    log "INFO" "Starting Helm rollback for release $release_name to revision $revision"

    # Validate helm release
    if ! helm history "$release_name" -n "$namespace" &> /dev/null; then
        log "ERROR" "Helm release $release_name not found"
        return 1
    }

    # Execute helm rollback
    if ! helm rollback "$release_name" "$revision" -n "$namespace" --wait --timeout "${TIMEOUT}s" --atomic; then
        log "ERROR" "Failed to rollback helm release $release_name"
        return 1
    }

    # Verify release status
    if [ "$(helm status "$release_name" -n "$namespace" -o json | jq -r '.info.status')" != "deployed" ]; then
        log "ERROR" "Helm release $release_name is not in deployed state"
        return 1
    }

    return 0
}

# Infrastructure rollback function
rollback_infrastructure() {
    local environment=$1
    local state_file=$2

    log "INFO" "Starting infrastructure rollback for environment $environment"

    # Validate terraform state
    if ! terraform validate -var-file="$state_file"; then
        log "ERROR" "Invalid terraform state file"
        return 1
    }

    # Execute terraform plan
    if ! terraform plan -var-file="$state_file" -out=rollback.tfplan; then
        log "ERROR" "Failed to create terraform rollback plan"
        return 1
    }

    # Apply terraform changes
    if ! terraform apply -auto-approve rollback.tfplan; then
        log "ERROR" "Failed to apply terraform rollback"
        return 1
    }

    return 0
}

# Validation function
validate_rollback() {
    local environment=$1
    log "INFO" "Validating rollback for environment: $environment"

    # Check pod status
    if ! kubectl get pods -n matter-platform --field-selector status.phase=Running | grep -q "1/1"; then
        log "ERROR" "Pod health check failed"
        return 1
    }

    # Verify service endpoints
    local services=("api-gateway" "auth-service")
    for service in "${services[@]}"; do
        if ! kubectl exec -n matter-platform -it "deploy/$service" -- curl -s http://localhost:3000/health | grep -q "ok"; then
            log "ERROR" "Service health check failed for $service"
            return 1
        fi
    done

    # Check metrics
    if ! curl -s "http://prometheus:9090/api/v1/query?query=up" | grep -q "1"; then
        log "ERROR" "Metrics validation failed"
        return 1
    }

    log "INFO" "Rollback validation completed successfully"
    return 0
}

# Cleanup function
cleanup() {
    log "INFO" "Performing cleanup"
    rm -f rollback.tfplan
    rm -f /tmp/pre_rollback_*.json
}

# Main execution
main() {
    local environment=$1
    local component=$2
    local revision=$3

    initialize

    if ! check_prerequisites "$environment"; then
        log "ERROR" "Prerequisites check failed"
        exit 1
    }

    case $component in
        kubernetes)
            rollback_kubernetes "matter-platform" "$4" "$revision"
            ;;
        helm)
            rollback_helm "$4" "matter-platform" "$revision"
            ;;
        infrastructure)
            rollback_infrastructure "$environment" "$4"
            ;;
        *)
            log "ERROR" "Invalid component specified: $component"
            exit 1
            ;;
    esac

    if ! validate_rollback "$environment"; then
        log "ERROR" "Rollback validation failed"
        exit 1
    }

    cleanup
    log "INFO" "Rollback completed successfully"
}

# Script entry point
if [ "$#" -lt 3 ]; then
    echo "Usage: $0 <environment> <component> <revision> [component_name]"
    exit 1
fi

main "$@"