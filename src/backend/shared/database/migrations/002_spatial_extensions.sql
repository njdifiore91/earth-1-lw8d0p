-- PostgreSQL 14+ Spatial Extensions Migration
-- Dependencies: 
-- - PostgreSQL 14+
-- - PostGIS 3.3+
-- - PostGIS Topology 3.3+

-- Set migration parameters
\set ON_ERROR_STOP on
\set VERBOSITY verbose

BEGIN;

-- Enable PostGIS extensions
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS postgis_topology;

-- Set search path for migration
SET search_path TO matter, public, topology;

-- Configure supported spatial reference systems
DO $$
DECLARE
    supported_srids integer[] := ARRAY[4326, 3857, 32633, 32634, 32635];
    srid integer;
BEGIN
    -- Enable and validate each supported SRID
    FOREACH srid IN ARRAY supported_srids
    LOOP
        -- Ensure SRID exists in spatial_ref_sys
        IF NOT EXISTS (SELECT 1 FROM spatial_ref_sys WHERE srid = srid) THEN
            RAISE EXCEPTION 'Required SRID % not found in spatial_ref_sys', srid;
        END IF;
    END LOOP;
END
$$;

-- Create enhanced geometry validation function
CREATE OR REPLACE FUNCTION validate_geometry(
    geom geometry,
    check_topology boolean DEFAULT false
) RETURNS jsonb
    LANGUAGE plpgsql
    SECURITY DEFINER
    STRICT
AS $$
DECLARE
    validation_result jsonb;
    topology_result text;
BEGIN
    -- Initialize validation result
    validation_result := jsonb_build_object(
        'is_valid', false,
        'errors', jsonb_build_array(),
        'details', jsonb_build_object()
    );

    -- Basic geometry validation
    IF geom IS NULL THEN
        validation_result := jsonb_set(validation_result, '{errors}', 
            validation_result->'errors' || jsonb_build_array('Geometry is null'));
        RETURN validation_result;
    END IF;

    -- Check SRID
    IF ST_SRID(geom) NOT IN (4326, 3857, 32633, 32634, 32635) THEN
        validation_result := jsonb_set(validation_result, '{errors}', 
            validation_result->'errors' || jsonb_build_array('Invalid SRID'));
    END IF;

    -- Validate geometry
    IF NOT ST_IsValid(geom) THEN
        validation_result := jsonb_set(validation_result, '{errors}', 
            validation_result->'errors' || jsonb_build_array(ST_IsValidReason(geom)));
    END IF;

    -- Check for self-intersections
    IF ST_IsSimple(geom) = false THEN
        validation_result := jsonb_set(validation_result, '{errors}', 
            validation_result->'errors' || jsonb_build_array('Geometry has self-intersections'));
    END IF;

    -- Topology validation if requested
    IF check_topology THEN
        BEGIN
            topology_result := ValidateTopology('matter_topology', 0.001);
            IF topology_result IS NOT NULL THEN
                validation_result := jsonb_set(validation_result, '{errors}', 
                    validation_result->'errors' || jsonb_build_array(topology_result));
            END IF;
        EXCEPTION WHEN OTHERS THEN
            validation_result := jsonb_set(validation_result, '{errors}', 
                validation_result->'errors' || jsonb_build_array('Topology validation failed: ' || SQLERRM));
        END;
    END IF;

    -- Set final validation status
    IF jsonb_array_length(validation_result->'errors') = 0 THEN
        validation_result := jsonb_set(validation_result, '{is_valid}', 'true'::jsonb);
    END IF;

    -- Add geometry details
    validation_result := jsonb_set(validation_result, '{details}', jsonb_build_object(
        'type', ST_GeometryType(geom),
        'srid', ST_SRID(geom),
        'dimensions', ST_NDims(geom),
        'bounds', ST_AsText(ST_Envelope(geom))
    ));

    RETURN validation_result;
END;
$$;

COMMENT ON FUNCTION validate_geometry(geometry, boolean) IS 'Enhanced geometry validation with topology support and detailed error reporting';

-- Create coordinate transformation function
CREATE OR REPLACE FUNCTION transform_coordinates(
    geom geometry,
    source_srid integer,
    target_srid integer,
    validate boolean DEFAULT true
) RETURNS jsonb
    LANGUAGE plpgsql
    SECURITY DEFINER
    STRICT
AS $$
DECLARE
    transformed_geom geometry;
    validation_result jsonb;
    result jsonb;
BEGIN
    -- Validate input parameters
    IF geom IS NULL OR source_srid IS NULL OR target_srid IS NULL THEN
        RAISE EXCEPTION 'Input parameters cannot be null';
    END IF;

    -- Verify SRID support
    IF source_srid NOT IN (4326, 3857, 32633, 32634, 32635) OR 
       target_srid NOT IN (4326, 3857, 32633, 32634, 32635) THEN
        RAISE EXCEPTION 'Unsupported SRID. Must be one of: 4326, 3857, 32633, 32634, 32635';
    END IF;

    -- Pre-transformation validation
    IF validate THEN
        validation_result := validate_geometry(geom);
        IF NOT (validation_result->>'is_valid')::boolean THEN
            RAISE EXCEPTION 'Invalid input geometry: %', validation_result->'errors';
        END IF;
    END IF;

    -- Perform transformation
    BEGIN
        transformed_geom := ST_Transform(ST_SetSRID(geom, source_srid), target_srid);
    EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'Transformation failed: %', SQLERRM;
    END;

    -- Post-transformation validation
    IF validate THEN
        validation_result := validate_geometry(transformed_geom);
        IF NOT (validation_result->>'is_valid')::boolean THEN
            RAISE EXCEPTION 'Invalid transformed geometry: %', validation_result->'errors';
        END IF;
    END IF;

    -- Prepare result
    result := jsonb_build_object(
        'geometry', ST_AsText(transformed_geom),
        'source_srid', source_srid,
        'target_srid', target_srid,
        'transformation_success', true,
        'metadata', jsonb_build_object(
            'bounds', ST_AsText(ST_Envelope(transformed_geom)),
            'dimensions', ST_NDims(transformed_geom),
            'type', ST_GeometryType(transformed_geom)
        )
    );

    RETURN result;
END;
$$;

COMMENT ON FUNCTION transform_coordinates(geometry, integer, integer, boolean) IS 'Enhanced coordinate transformation with validation and metadata';

-- Create optimized spatial indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS location_geom_gist_idx
    ON locations USING GIST (coordinates);

CREATE INDEX CONCURRENTLY IF NOT EXISTS location_geom_brin_idx
    ON locations USING BRIN (coordinates)
    WITH (pages_per_range = 128);

-- Record schema version update
SELECT update_schema_version('1.0.2', 'Added spatial extensions and enhanced geometry functions');

COMMIT;