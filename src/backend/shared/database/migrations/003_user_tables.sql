-- PostgreSQL 14+ User Tables Migration
-- Dependencies: 
-- - PostgreSQL 14+
-- - postgresql-contrib 14+ (pgcrypto extension)

\set ON_ERROR_STOP on
\set VERBOSITY verbose

BEGIN;

-- Set search path
SET search_path TO matter, public;

-- Create secure password hashing function
CREATE OR REPLACE FUNCTION hash_password(
    password text,
    work_factor integer DEFAULT 12
) RETURNS text
    LANGUAGE plpgsql
    SECURITY DEFINER
    IMMUTABLE
AS $$
BEGIN
    -- Validate password complexity
    IF NOT password ~ '^(?=.*[A-Za-z])(?=.*\d)(?=.*[@$!%*#?&])[A-Za-z\d@$!%*#?&]{8,}$' THEN
        RAISE EXCEPTION 'Password does not meet complexity requirements'
            USING ERRCODE = 'invalid_parameter_value';
    END IF;

    -- Hash password using bcrypt with specified work factor
    RETURN crypt(password, gen_salt('bf', work_factor));
END;
$$;

COMMENT ON FUNCTION hash_password(text, integer) IS 'Securely hashes passwords using bcrypt with configurable work factor';

-- Create users table with enhanced security features
CREATE TABLE users (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email text NOT NULL UNIQUE 
        CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'),
    password_hash text NOT NULL,
    role text NOT NULL DEFAULT 'CUSTOMER'
        CHECK (role IN ('CUSTOMER', 'ADMIN', 'SERVICE')),
    status text NOT NULL DEFAULT 'ACTIVE'
        CHECK (status IN ('ACTIVE', 'INACTIVE', 'LOCKED', 'PENDING')),
    failed_login_attempts integer NOT NULL DEFAULT 0,
    last_login timestamp with time zone DEFAULT NULL,
    created_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE users IS 'Stores user accounts with enhanced security features';

-- Create optimized indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS users_email_idx 
    ON users (email);

CREATE INDEX CONCURRENTLY IF NOT EXISTS users_role_status_idx 
    ON users (role, status);

-- Create user sessions table for secure session management
CREATE TABLE user_sessions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash text NOT NULL,
    ip_address inet,
    user_agent text,
    created_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at timestamp with time zone NOT NULL,
    revoked_at timestamp with time zone DEFAULT NULL,
    CONSTRAINT valid_session_period CHECK (expires_at > created_at)
);

COMMENT ON TABLE user_sessions IS 'Manages user sessions with security tracking';

-- Create optimized session indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS user_sessions_compound_idx 
    ON user_sessions (user_id, expires_at);

CREATE INDEX CONCURRENTLY IF NOT EXISTS user_sessions_active_idx 
    ON user_sessions (expires_at) 
    WHERE expires_at > CURRENT_TIMESTAMP;

-- Create user audit trigger function
CREATE OR REPLACE FUNCTION user_audit_trigger() RETURNS trigger
    LANGUAGE plpgsql
    SECURITY DEFINER
    VOLATILE
AS $$
DECLARE
    v_old_data jsonb;
    v_new_data jsonb;
    v_session_context jsonb;
BEGIN
    -- Prepare old and new data for audit log
    IF (TG_OP = 'UPDATE' OR TG_OP = 'DELETE') THEN
        v_old_data = to_jsonb(OLD);
        -- Mask sensitive data
        v_old_data = jsonb_set(v_old_data, '{password_hash}', '"*****"');
        v_old_data = jsonb_set(v_old_data, '{email}', 
            format('"%s"', substring(OLD.email, 1, 2) || '*****' || substring(OLD.email from '@.*'))::jsonb);
    END IF;

    IF (TG_OP = 'INSERT' OR TG_OP = 'UPDATE') THEN
        v_new_data = to_jsonb(NEW);
        -- Mask sensitive data
        v_new_data = jsonb_set(v_new_data, '{password_hash}', '"*****"');
        v_new_data = jsonb_set(v_new_data, '{email}', 
            format('"%s"', substring(NEW.email, 1, 2) || '*****' || substring(NEW.email from '@.*'))::jsonb);
    END IF;

    -- Build session context
    v_session_context = jsonb_build_object(
        'ip_address', inet_client_addr(),
        'timestamp', current_timestamp,
        'application_name', current_setting('application_name')
    );

    -- Log the audit event
    PERFORM log_audit_event(
        CASE TG_OP
            WHEN 'INSERT' THEN 'USER_CREATED'
            WHEN 'UPDATE' THEN 'USER_UPDATED'
            WHEN 'DELETE' THEN 'USER_DELETED'
        END,
        TG_TABLE_NAME::text,
        CASE TG_OP
            WHEN 'DELETE' THEN OLD.id
            ELSE NEW.id
        END,
        v_old_data,
        v_new_data,
        NULLIF(current_setting('matter.current_user_id', true), '')::uuid,
        v_session_context
    );

    -- For inserts and updates, update the updated_at timestamp
    IF (TG_OP = 'INSERT' OR TG_OP = 'UPDATE') THEN
        NEW.updated_at = CURRENT_TIMESTAMP;
    END IF;

    RETURN CASE TG_OP
        WHEN 'DELETE' THEN OLD
        ELSE NEW
    END;
END;
$$;

COMMENT ON FUNCTION user_audit_trigger() IS 'Trigger for comprehensive user table auditing with sensitive data masking';

-- Create user audit triggers
CREATE TRIGGER users_audit_trigger
    BEFORE INSERT OR UPDATE OR DELETE ON users
    FOR EACH ROW
    EXECUTE FUNCTION user_audit_trigger();

-- Create session cleanup function
CREATE OR REPLACE FUNCTION cleanup_expired_sessions() RETURNS void
    LANGUAGE plpgsql
    SECURITY DEFINER
    VOLATILE
AS $$
BEGIN
    DELETE FROM user_sessions
    WHERE expires_at < CURRENT_TIMESTAMP
    OR revoked_at IS NOT NULL;
END;
$$;

COMMENT ON FUNCTION cleanup_expired_sessions() IS 'Removes expired and revoked sessions';

-- Update schema version
SELECT update_schema_version('1.0.3', 'User tables migration with enhanced security features');

COMMIT;