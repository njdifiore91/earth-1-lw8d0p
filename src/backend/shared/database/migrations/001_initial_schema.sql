-- PostgreSQL 14+ Initial Schema Migration
-- Dependencies: 
-- - PostgreSQL 14+
-- - postgresql-contrib 14+ (pgcrypto extension)

-- Set migration parameters
\set ON_ERROR_STOP on
\set VERBOSITY verbose

BEGIN;

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Create application schema with enhanced security
CREATE SCHEMA IF NOT EXISTS matter;
COMMENT ON SCHEMA matter IS 'Main application schema with enhanced security policies';

-- Set search path for migration
SET search_path TO matter, public;

-- Schema version tracking table
CREATE TABLE schema_version (
    id serial PRIMARY KEY,
    version text NOT NULL,
    description text NOT NULL,
    applied_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    applied_by uuid NOT NULL
);

COMMENT ON TABLE schema_version IS 'Tracks database schema versions and migration history';
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS schema_version_version_idx ON schema_version (version);

-- Create partitioned audit log table
CREATE TABLE audit_log (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type text NOT NULL,
    table_name text NOT NULL,
    record_id uuid NOT NULL,
    old_data jsonb DEFAULT NULL,
    new_data jsonb DEFAULT NULL,
    user_id uuid NOT NULL,
    session_context jsonb NOT NULL,
    timestamp timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    retention_policy text NOT NULL DEFAULT 'standard'
) PARTITION BY RANGE (timestamp);

COMMENT ON TABLE audit_log IS 'Comprehensive audit logging with enhanced security and compliance features';

-- Create audit log partitions for the next 12 months
DO $$
BEGIN
    FOR i IN 0..11 LOOP
        EXECUTE format(
            'CREATE TABLE audit_log_%s PARTITION OF audit_log 
            FOR VALUES FROM (%L) TO (%L)',
            to_char(CURRENT_DATE + (interval '1 month' * i), 'YYYY_MM'),
            date_trunc('month', CURRENT_DATE + (interval '1 month' * i)),
            date_trunc('month', CURRENT_DATE + (interval '1 month' * (i + 1)))
        );
    END LOOP;
END $$;

-- Create optimized indexes for audit log
CREATE INDEX CONCURRENTLY IF NOT EXISTS audit_log_timestamp_idx 
    ON audit_log (timestamp) 
    INCLUDE (event_type, table_name);

CREATE INDEX CONCURRENTLY IF NOT EXISTS audit_log_table_record_idx 
    ON audit_log (table_name, record_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS audit_log_active_idx 
    ON audit_log (timestamp) 
    WHERE timestamp > current_timestamp - interval '30 days';

-- Create schema version update function
CREATE OR REPLACE FUNCTION update_schema_version(
    p_version text,
    p_description text
) RETURNS void
    LANGUAGE plpgsql
    SECURITY DEFINER
    VOLATILE
AS $$
DECLARE
    v_user_id uuid;
BEGIN
    -- Validate version format
    IF NOT p_version ~ '^[0-9]+\.[0-9]+\.[0-9]+$' THEN
        RAISE EXCEPTION 'Invalid version format. Expected: X.Y.Z' USING ERRCODE = 'invalid_parameter_value';
    END IF;

    -- Get current user ID from session context
    v_user_id := current_setting('matter.current_user_id')::uuid;

    -- Begin atomic transaction
    BEGIN
        -- Insert new version record
        INSERT INTO schema_version (version, description, applied_by)
        VALUES (p_version, p_description, v_user_id);

        -- Log schema update in audit log
        PERFORM log_audit_event(
            'SCHEMA_UPDATE',
            'schema_version',
            gen_random_uuid(),
            NULL,
            jsonb_build_object('version', p_version, 'description', p_description),
            v_user_id,
            jsonb_build_object('source', 'migration')
        );
    EXCEPTION
        WHEN unique_violation THEN
            RAISE EXCEPTION 'Schema version % already exists', p_version
                USING ERRCODE = 'unique_violation';
        WHEN OTHERS THEN
            RAISE;
    END;
END;
$$;

COMMENT ON FUNCTION update_schema_version(text, text) IS 'Updates schema version with validation and audit logging';

-- Create audit logging function
CREATE OR REPLACE FUNCTION log_audit_event(
    p_event_type text,
    p_table_name text,
    p_record_id uuid,
    p_old_data jsonb,
    p_new_data jsonb,
    p_user_id uuid,
    p_session_context jsonb
) RETURNS void
    LANGUAGE plpgsql
    SECURITY DEFINER
    VOLATILE
AS $$
DECLARE
    v_retention_policy text;
    v_sanitized_old_data jsonb;
    v_sanitized_new_data jsonb;
BEGIN
    -- Validate input parameters
    IF p_event_type IS NULL OR p_table_name IS NULL OR p_record_id IS NULL OR p_user_id IS NULL THEN
        RAISE EXCEPTION 'Required audit log parameters cannot be null'
            USING ERRCODE = 'null_value_not_allowed';
    END IF;

    -- Determine retention policy based on table and event type
    v_retention_policy := CASE
        WHEN p_table_name IN ('users', 'auth_tokens') THEN 'sensitive'
        WHEN p_event_type = 'SECURITY_EVENT' THEN 'extended'
        ELSE 'standard'
    END;

    -- Sanitize sensitive data
    v_sanitized_old_data := CASE
        WHEN v_retention_policy = 'sensitive' THEN 
            redact_sensitive_data(p_old_data)
        ELSE p_old_data
    END;

    v_sanitized_new_data := CASE
        WHEN v_retention_policy = 'sensitive' THEN 
            redact_sensitive_data(p_new_data)
        ELSE p_new_data
    END;

    -- Insert audit record
    INSERT INTO audit_log (
        event_type,
        table_name,
        record_id,
        old_data,
        new_data,
        user_id,
        session_context,
        retention_policy
    ) VALUES (
        p_event_type,
        p_table_name,
        p_record_id,
        v_sanitized_old_data,
        v_sanitized_new_data,
        p_user_id,
        p_session_context,
        v_retention_policy
    );

EXCEPTION
    WHEN OTHERS THEN
        -- Log critical errors but don't fail the transaction
        RAISE WARNING 'Failed to create audit log: %', SQLERRM;
END;
$$;

COMMENT ON FUNCTION log_audit_event(text, text, uuid, jsonb, jsonb, uuid, jsonb) IS 'Records audit events with enhanced security and compliance features';

-- Record initial schema version
SELECT update_schema_version('1.0.0', 'Initial schema migration');

COMMIT;

-- Create cleanup function for audit logs
CREATE OR REPLACE FUNCTION cleanup_audit_logs() RETURNS void
    LANGUAGE plpgsql
    SECURITY DEFINER
    VOLATILE
AS $$
BEGIN
    -- Delete expired audit logs based on retention policy
    DELETE FROM audit_log
    WHERE (retention_policy = 'standard' AND timestamp < current_timestamp - interval '730 days')
       OR (retention_policy = 'sensitive' AND timestamp < current_timestamp - interval '1825 days')
       OR (retention_policy = 'extended' AND timestamp < current_timestamp - interval '3650 days');
END;
$$;

COMMENT ON FUNCTION cleanup_audit_logs() IS 'Implements retention policy for audit logs';

-- Create maintenance function for audit log partitions
CREATE OR REPLACE FUNCTION maintain_audit_log_partitions() RETURNS void
    LANGUAGE plpgsql
    SECURITY DEFINER
    VOLATILE
AS $$
DECLARE
    v_future_date date;
BEGIN
    -- Create partitions for the next 3 months if they don't exist
    FOR i IN 1..3 LOOP
        v_future_date := date_trunc('month', current_date + (interval '1 month' * i));
        
        EXECUTE format(
            'CREATE TABLE IF NOT EXISTS audit_log_%s PARTITION OF audit_log
            FOR VALUES FROM (%L) TO (%L)',
            to_char(v_future_date, 'YYYY_MM'),
            v_future_date,
            v_future_date + interval '1 month'
        );
    END LOOP;
END;
$$;

COMMENT ON FUNCTION maintain_audit_log_partitions() IS 'Maintains rolling audit log partitions';