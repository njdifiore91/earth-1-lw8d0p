#!/bin/bash

# Matter Platform Database Initialization Script
# Version: 1.0.0
# Dependencies:
# - PostgreSQL Client 14+
# - PostGIS 3.3+
# - postgresql-contrib 14+

set -euo pipefail
IFS=$'\n\t'

# Default environment variables
POSTGRES_DB=${POSTGRES_DB:-"matter_db"}
POSTGRES_USER=${POSTGRES_USER:-"matter_user"}
POSTGRES_HOST=${POSTGRES_HOST:-"localhost"}
POSTGRES_PORT=${POSTGRES_PORT:-"5432"}
MIGRATIONS_DIR=${MIGRATIONS_DIR:-"../src/backend/shared/database/migrations"}
POSTGRES_SSL_MODE=${POSTGRES_SSL_MODE:-"verify-full"}
POSTGRES_MIN_CONNECTIONS=${POSTGRES_MIN_CONNECTIONS:-"10"}
POSTGRES_MAX_CONNECTIONS=${POSTGRES_MAX_CONNECTIONS:-"100"}
POSTGRES_STATEMENT_TIMEOUT=${POSTGRES_STATEMENT_TIMEOUT:-"30000"}

# Logging function
log() {
    echo "[$(date +'%Y-%m-%dT%H:%M:%S%z')] $@"
}

# Error handling function
error_exit() {
    log "ERROR: $1" >&2
    exit "${2:-1}"
}

# Check prerequisites
check_prerequisites() {
    log "Checking prerequisites..."

    # Check PostgreSQL client
    if ! command -v psql >/dev/null 2>&1; then
        error_exit "PostgreSQL client (psql) not found"
    fi

    # Verify PostgreSQL version
    local pg_version=$(psql --version | awk '{print $3}' | cut -d. -f1)
    if [ "$pg_version" -lt "14" ]; then
        error_exit "PostgreSQL version must be 14 or higher"
    fi

    # Check PostGIS installation
    if ! command -v postgis >/dev/null 2>&1; then
        error_exit "PostGIS not found"
    fi

    # Verify PostGIS version
    local postgis_version=$(postgis --version | awk '{print $2}' | cut -d. -f1,2)
    if [ "$(echo "$postgis_version >= 3.3" | bc -l)" -ne 1 ]; then
        error_exit "PostGIS version must be 3.3 or higher"
    }

    # Check migrations directory
    if [ ! -d "$MIGRATIONS_DIR" ]; then
        error_exit "Migrations directory not found: $MIGRATIONS_DIR"
    fi

    # Verify SSL certificates if SSL mode is enabled
    if [ "$POSTGRES_SSL_MODE" = "verify-full" ]; then
        if [ ! -f "${SSL_CERT_FILE:-}" ] || [ ! -f "${SSL_KEY_FILE:-}" ]; then
            error_exit "SSL certificates not found"
        fi
    fi

    log "Prerequisites check completed successfully"
    return 0
}

# Create and configure database
create_database() {
    log "Creating and configuring database..."

    # Database creation with proper encoding and collation
    psql -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -U "$POSTGRES_USER" -d postgres <<-EOSQL
        CREATE DATABASE $POSTGRES_DB
            WITH ENCODING = 'UTF8'
            LC_COLLATE = 'en_US.UTF-8'
            LC_CTYPE = 'en_US.UTF-8'
            TEMPLATE = template0;
EOSQL

    # Configure database parameters
    psql -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -U "$POSTGRES_USER" -d "$POSTGRES_DB" <<-EOSQL
        ALTER SYSTEM SET ssl = on;
        ALTER SYSTEM SET ssl_cipher_suites = 'HIGH:MEDIUM:+3DES:!aNULL';
        ALTER SYSTEM SET ssl_prefer_server_ciphers = on;
        ALTER SYSTEM SET ssl_min_protocol_version = 'TLSv1.2';
        
        ALTER SYSTEM SET max_connections = '$POSTGRES_MAX_CONNECTIONS';
        ALTER SYSTEM SET superuser_reserved_connections = '3';
        ALTER SYSTEM SET statement_timeout = '$POSTGRES_STATEMENT_TIMEOUT';
        
        ALTER SYSTEM SET shared_buffers = '256MB';
        ALTER SYSTEM SET work_mem = '16MB';
        ALTER SYSTEM SET maintenance_work_mem = '128MB';
        
        ALTER SYSTEM SET autovacuum = on;
        ALTER SYSTEM SET autovacuum_vacuum_scale_factor = '0.1';
        ALTER SYSTEM SET autovacuum_analyze_scale_factor = '0.05';
EOSQL

    log "Database created and configured successfully"
    return 0
}

# Install required extensions
install_extensions() {
    log "Installing database extensions..."

    psql -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -U "$POSTGRES_USER" -d "$POSTGRES_DB" <<-EOSQL
        CREATE EXTENSION IF NOT EXISTS postgis;
        CREATE EXTENSION IF NOT EXISTS postgis_topology;
        CREATE EXTENSION IF NOT EXISTS pgcrypto;
        
        -- Verify extensions
        DO \$\$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_extension WHERE extname = 'postgis'
                AND extversion >= '3.3'
            ) THEN
                RAISE EXCEPTION 'PostGIS 3.3+ extension not properly installed';
            END IF;
            
            IF NOT EXISTS (
                SELECT 1 FROM pg_extension WHERE extname = 'postgis_topology'
            ) THEN
                RAISE EXCEPTION 'PostGIS topology extension not properly installed';
            END IF;
            
            IF NOT EXISTS (
                SELECT 1 FROM pg_extension WHERE extname = 'pgcrypto'
            ) THEN
                RAISE EXCEPTION 'pgcrypto extension not properly installed';
            END IF;
        END
        \$\$;
EOSQL

    log "Extensions installed successfully"
    return 0
}

# Apply database migrations
apply_migrations() {
    log "Applying database migrations..."

    local migration_files=($(ls -v "$MIGRATIONS_DIR"/*.sql))
    
    for migration in "${migration_files[@]}"; do
        log "Applying migration: $(basename "$migration")"
        
        if ! psql -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" \
            -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
            -v ON_ERROR_STOP=1 \
            -f "$migration"; then
            error_exit "Failed to apply migration: $(basename "$migration")"
        fi
    done

    log "Migrations applied successfully"
    return 0
}

# Verify database installation
verify_installation() {
    log "Verifying database installation..."

    psql -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -U "$POSTGRES_USER" -d "$POSTGRES_DB" <<-EOSQL
        -- Verify schema and tables
        DO \$\$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = 'matter') THEN
                RAISE EXCEPTION 'Matter schema not found';
            END IF;
            
            IF NOT EXISTS (SELECT 1 FROM information_schema.tables 
                WHERE table_schema = 'matter' AND table_name = 'schema_version') THEN
                RAISE EXCEPTION 'Schema version table not found';
            END IF;
            
            IF NOT EXISTS (SELECT 1 FROM information_schema.tables 
                WHERE table_schema = 'matter' AND table_name = 'audit_log') THEN
                RAISE EXCEPTION 'Audit log table not found';
            END IF;
            
            -- Verify PostGIS functionality
            PERFORM ST_Point(0,0);
            
            -- Verify encryption functionality
            PERFORM gen_random_uuid();
            
            -- Verify spatial indexes
            IF NOT EXISTS (
                SELECT 1 FROM pg_indexes 
                WHERE indexname = 'location_geom_gist_idx'
            ) THEN
                RAISE EXCEPTION 'Spatial indexes not properly created';
            END IF;
        END
        \$\$;
EOSQL

    log "Installation verification completed successfully"
    return 0
}

# Main execution
main() {
    log "Starting database initialization..."

    check_prerequisites || error_exit "Prerequisites check failed"
    create_database || error_exit "Database creation failed"
    install_extensions || error_exit "Extension installation failed"
    apply_migrations || error_exit "Migration application failed"
    verify_installation || error_exit "Installation verification failed"

    log "Database initialization completed successfully"
    return 0
}

# Execute main function
main "$@"