-- PostgreSQL 14+ Search Tables Migration
-- Dependencies: 
-- - PostgreSQL 14+
-- - PostGIS 3.3+
-- - Previous migrations (001_initial_schema.sql, 002_spatial_extensions.sql, 003_user_tables.sql)

\set ON_ERROR_STOP on
\set VERBOSITY verbose

BEGIN;

-- Set search path
SET search_path TO matter, public;

-- Create searches table
CREATE TABLE searches (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status text NOT NULL DEFAULT 'draft' 
        CHECK (status IN ('draft', 'submitted', 'processing', 'completed', 'archived', 'deleted')),
    parameters jsonb NOT NULL DEFAULT '{}',
    created_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    archived_at timestamp with time zone DEFAULT NULL
);

COMMENT ON TABLE searches IS 'Core search requests with status tracking and parameters';

-- Create locations table with spatial support
CREATE TABLE locations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    search_id uuid NOT NULL REFERENCES searches(id) ON DELETE CASCADE,
    coordinates geometry(Geometry, 4326) NOT NULL,
    type text NOT NULL CHECK (type IN ('area', 'point', 'path', 'kml')),
    metadata jsonb NOT NULL DEFAULT '{}',
    created_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE locations IS 'Spatial data associated with searches';

-- Create assets table
CREATE TABLE assets (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    search_id uuid NOT NULL REFERENCES searches(id) ON DELETE CASCADE,
    name text NOT NULL,
    type text NOT NULL,
    properties jsonb NOT NULL DEFAULT '{}',
    created_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE assets IS 'Asset definitions for search requirements';

-- Create requirements table
CREATE TABLE requirements (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    asset_id uuid NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    parameter text NOT NULL,
    value numeric NOT NULL,
    unit text NOT NULL,
    created_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT valid_requirement CHECK (value >= 0)
);

COMMENT ON TABLE requirements IS 'Specific requirements for assets';

-- Create optimized indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS searches_user_status_idx 
    ON searches (user_id, status);

CREATE INDEX CONCURRENTLY IF NOT EXISTS searches_active_idx 
    ON searches (status) 
    WHERE status IN ('draft', 'submitted', 'processing');

CREATE INDEX CONCURRENTLY IF NOT EXISTS locations_search_idx 
    ON locations (search_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS locations_coordinates_gist_idx 
    ON locations USING GIST (coordinates);

CREATE INDEX CONCURRENTLY IF NOT EXISTS locations_coordinates_brin_idx 
    ON locations USING BRIN (coordinates) 
    WITH (pages_per_range = 128);

CREATE INDEX CONCURRENTLY IF NOT EXISTS assets_search_idx 
    ON assets (search_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS requirements_asset_idx 
    ON requirements (asset_id);

-- Create search audit trigger function
CREATE OR REPLACE FUNCTION search_audit_trigger() RETURNS trigger
    LANGUAGE plpgsql
    SECURITY DEFINER
    VOLATILE
AS $$
DECLARE
    v_old_data jsonb;
    v_new_data jsonb;
    v_session_context jsonb;
BEGIN
    -- Prepare audit data
    IF (TG_OP = 'UPDATE' OR TG_OP = 'DELETE') THEN
        v_old_data = to_jsonb(OLD);
    END IF;

    IF (TG_OP = 'INSERT' OR TG_OP = 'UPDATE') THEN
        v_new_data = to_jsonb(NEW);
        
        -- Validate status transitions
        IF TG_OP = 'UPDATE' AND OLD.status != NEW.status THEN
            IF NOT (
                (OLD.status = 'draft' AND NEW.status IN ('submitted', 'deleted')) OR
                (OLD.status = 'submitted' AND NEW.status IN ('processing', 'deleted')) OR
                (OLD.status = 'processing' AND NEW.status IN ('completed', 'deleted')) OR
                (OLD.status = 'completed' AND NEW.status IN ('archived', 'deleted'))
            ) THEN
                RAISE EXCEPTION 'Invalid status transition from % to %', OLD.status, NEW.status;
            END IF;
        END IF;
    END IF;

    -- Build session context
    v_session_context = jsonb_build_object(
        'ip_address', inet_client_addr(),
        'timestamp', current_timestamp,
        'application_name', current_setting('application_name')
    );

    -- Log audit event
    PERFORM log_audit_event(
        CASE TG_OP
            WHEN 'INSERT' THEN 'SEARCH_CREATED'
            WHEN 'UPDATE' THEN 'SEARCH_UPDATED'
            WHEN 'DELETE' THEN 'SEARCH_DELETED'
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

    -- Update timestamp
    IF (TG_OP = 'INSERT' OR TG_OP = 'UPDATE') THEN
        NEW.updated_at = CURRENT_TIMESTAMP;
    END IF;

    RETURN CASE TG_OP
        WHEN 'DELETE' THEN OLD
        ELSE NEW
    END;
END;
$$;

COMMENT ON FUNCTION search_audit_trigger() IS 'Comprehensive audit trigger for search-related changes';

-- Create location validation trigger function
CREATE OR REPLACE FUNCTION location_validation_trigger() RETURNS trigger
    LANGUAGE plpgsql
    SECURITY DEFINER
    VOLATILE
AS $$
DECLARE
    validation_result jsonb;
BEGIN
    -- Validate geometry
    validation_result := validate_geometry(NEW.coordinates);
    
    IF NOT (validation_result->>'is_valid')::boolean THEN
        RAISE EXCEPTION 'Invalid geometry: %', validation_result->'errors';
    END IF;

    -- Additional validation based on type
    CASE NEW.type
        WHEN 'area' THEN
            IF NOT ST_GeometryType(NEW.coordinates) IN ('ST_Polygon', 'ST_MultiPolygon') THEN
                RAISE EXCEPTION 'Area type requires polygon geometry';
            END IF;
        WHEN 'point' THEN
            IF NOT ST_GeometryType(NEW.coordinates) = 'ST_Point' THEN
                RAISE EXCEPTION 'Point type requires point geometry';
            END IF;
        WHEN 'path' THEN
            IF NOT ST_GeometryType(NEW.coordinates) IN ('ST_LineString', 'ST_MultiLineString') THEN
                RAISE EXCEPTION 'Path type requires linestring geometry';
            END IF;
    END CASE;

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION location_validation_trigger() IS 'Validates location geometry based on type';

-- Create triggers
CREATE TRIGGER searches_audit_trigger
    BEFORE INSERT OR UPDATE OR DELETE ON searches
    FOR EACH ROW
    EXECUTE FUNCTION search_audit_trigger();

CREATE TRIGGER locations_validation_trigger
    BEFORE INSERT OR UPDATE ON locations
    FOR EACH ROW
    EXECUTE FUNCTION location_validation_trigger();

-- Update schema version
SELECT update_schema_version('1.0.4', 'Search tables migration with spatial capabilities');

COMMIT;