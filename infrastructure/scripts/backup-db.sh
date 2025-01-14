#!/bin/bash

# Matter Platform - PostgreSQL Database Backup Script
# Version: 1.0.0
# Required packages:
# - postgresql-client v14+
# - gnupg v2.x
# - aws-cli v2.x

set -euo pipefail

# Global Configuration
BACKUP_DIR="/var/backups/postgresql"
RETENTION_DAYS=730  # 2 years for active backups
ARCHIVE_DAYS=1825   # 5 years for archived backups
S3_BUCKET="matter-db-backups"
S3_ARCHIVE_BUCKET="matter-db-archives"
KMS_KEY_ID="matter-backup-key"
MAX_RETRIES=3
BACKUP_THREADS=4
LOG_FILE="/var/log/matter/db-backup.log"

# Load environment variables
if [ -f "/etc/matter/db-backup.env" ]; then
    source "/etc/matter/db-backup.env"
fi

# Logging function
log() {
    local level=$1
    local component=$2
    local operation=$3
    local message=$4
    local timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    echo "${timestamp}|${level}|${component}|${operation}|${message}" >> "${LOG_FILE}"
}

# Validate environment
validate_environment() {
    local required_vars=("DB_HOST" "DB_PORT" "DB_NAME" "DB_USER" "DB_PASSWORD")
    
    for var in "${required_vars[@]}"; do
        if [ -z "${!var}" ]; then
            log "ERROR" "Environment" "Validation" "Missing required variable: ${var}"
            exit 1
        fi
    done

    # Verify AWS credentials and KMS access
    if ! aws sts get-caller-identity >/dev/null 2>&1; then
        log "ERROR" "AWS" "Authentication" "Invalid AWS credentials"
        exit 1
    fi
}

# Create backup with encryption and compression
create_backup() {
    local backup_name=$1
    local compression_level=${2:-9}
    local start_time=$(date +%s)
    local backup_file="${BACKUP_DIR}/${backup_name}"
    local checksum_file="${backup_file}.sha256"
    
    log "INFO" "Backup" "Start" "Initiating backup: ${backup_name}"
    
    # Create backup directory with secure permissions
    mkdir -p "${BACKUP_DIR}"
    chmod 700 "${BACKUP_DIR}"
    
    # Perform backup with parallel processing and compression
    PGPASSWORD="${DB_PASSWORD}" pg_dump \
        -h "${DB_HOST}" \
        -p "${DB_PORT}" \
        -U "${DB_USER}" \
        -d "${DB_NAME}" \
        -j "${BACKUP_THREADS}" \
        -F custom \
        -Z "${compression_level}" \
        -f "${backup_file}.tmp" \
        || { log "ERROR" "Backup" "Creation" "pg_dump failed"; return 1; }
    
    # Encrypt backup using GPG with AWS KMS
    gpg --encrypt \
        --recipient "${KMS_KEY_ID}" \
        --trust-model always \
        --output "${backup_file}.gpg" \
        "${backup_file}.tmp" \
        || { log "ERROR" "Backup" "Encryption" "GPG encryption failed"; return 2; }
    
    # Calculate checksum
    sha256sum "${backup_file}.gpg" > "${checksum_file}"
    
    # Upload to S3 with server-side encryption
    local retry_count=0
    while [ ${retry_count} -lt ${MAX_RETRIES} ]; do
        if aws s3 cp "${backup_file}.gpg" "s3://${S3_BUCKET}/${backup_name}.gpg" \
            --sse aws:kms \
            --sse-kms-key-id "${KMS_KEY_ID}" \
            && aws s3 cp "${checksum_file}" "s3://${S3_BUCKET}/${backup_name}.sha256"; then
            break
        fi
        retry_count=$((retry_count + 1))
        sleep $((2 ** retry_count))
    done
    
    if [ ${retry_count} -eq ${MAX_RETRIES} ]; then
        log "ERROR" "Backup" "Upload" "Failed to upload backup to S3"
        return 3
    fi
    
    # Calculate metrics
    local end_time=$(date +%s)
    local duration=$((end_time - start_time))
    local size=$(stat -f %z "${backup_file}.gpg")
    
    log "INFO" "Backup" "Complete" "Backup completed successfully|duration=${duration}s|size=${size}bytes"
    
    # Cleanup temporary files
    rm -f "${backup_file}.tmp" "${backup_file}.gpg" "${checksum_file}"
    
    return 0
}

# Manage backup retention
manage_retention() {
    local active_retention=$1
    local archive_retention=$2
    
    log "INFO" "Retention" "Start" "Managing backup retention"
    
    # Move old backups to archive
    aws s3 ls "s3://${S3_BUCKET}/" | while read -r line; do
        local backup_date=$(echo "$line" | awk '{print $1}')
        local backup_name=$(echo "$line" | awk '{print $4}')
        local age_days=$(( ($(date +%s) - $(date -d "$backup_date" +%s)) / 86400 ))
        
        if [ ${age_days} -gt ${active_retention} ] && [ ${age_days} -le ${archive_retention} ]; then
            aws s3 mv "s3://${S3_BUCKET}/${backup_name}" "s3://${S3_ARCHIVE_BUCKET}/${backup_name}" \
                || log "WARN" "Retention" "Archive" "Failed to archive: ${backup_name}"
        elif [ ${age_days} -gt ${archive_retention} ]; then
            aws s3 rm "s3://${S3_BUCKET}/${backup_name}" \
                || log "WARN" "Retention" "Delete" "Failed to delete: ${backup_name}"
        fi
    done
    
    log "INFO" "Retention" "Complete" "Retention management completed"
}

# Validate backup integrity
validate_backup() {
    local backup_file=$1
    local checksum=$2
    
    log "INFO" "Validation" "Start" "Validating backup: ${backup_file}"
    
    # Verify checksum
    if ! echo "${checksum}" | sha256sum --check --status; then
        log "ERROR" "Validation" "Checksum" "Backup checksum verification failed"
        return 1
    fi
    
    # Verify encryption
    if ! gpg --list-packets "${backup_file}" >/dev/null 2>&1; then
        log "ERROR" "Validation" "Encryption" "Backup encryption verification failed"
        return 2
    fi
    
    log "INFO" "Validation" "Complete" "Backup validation successful"
    return 0
}

# Main execution
main() {
    local backup_date=$(date -u +"%Y%m%d_%H%M%S")
    local backup_name="matter_db_backup_${backup_date}"
    
    # Validate environment
    validate_environment
    
    # Create backup
    if ! create_backup "${backup_name}" 9; then
        log "ERROR" "Main" "Backup" "Backup creation failed"
        exit 1
    fi
    
    # Manage retention
    if ! manage_retention ${RETENTION_DAYS} ${ARCHIVE_DAYS}; then
        log "WARN" "Main" "Retention" "Retention management failed"
    fi
    
    log "INFO" "Main" "Complete" "Backup process completed successfully"
}

# Execute main function
main "$@"