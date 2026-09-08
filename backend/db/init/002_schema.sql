-- ============================================================================
-- Morelia Conecta Database Schema
-- PostgreSQL + PostGIS for spatial operations
-- ============================================================================

-- Migrations tracking
CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enums
DO $$ BEGIN
  CREATE TYPE mobility_state AS ENUM ('IDLE', 'WALKING', 'WAITING', 'IN_TRANSIT', 'UNKNOWN');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE confidence_level AS ENUM ('Alta', 'Media', 'Baja');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE transport_mode AS ENUM ('Combi', 'Micro', 'Camión', 'Bus');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE data_source AS ENUM ('osm-demo', 'gtfs', 'api', 'simulation');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================================
-- Routes Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS routes (
  id TEXT PRIMARY KEY,
  ref TEXT NOT NULL,
  name TEXT NOT NULL,
  mode transport_mode NOT NULL DEFAULT 'Combi',
  color TEXT NOT NULL DEFAULT '#C94C28',
  osm_id BIGINT,
  variantes INTEGER NOT NULL DEFAULT 1,
  paradas_count INTEGER NOT NULL DEFAULT 0,
  sin_nombre BOOLEAN NOT NULL DEFAULT false,
  fuente data_source NOT NULL DEFAULT 'osm-demo',
  geometry GEOMETRY(MultiLineString, 4326) NOT NULL,
  total_length_m DOUBLE PRECISION NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_routes_geometry ON routes USING GIST (geometry);
CREATE INDEX IF NOT EXISTS idx_routes_name ON routes (name);

-- ============================================================================
-- Stops Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS stops (
  id TEXT PRIMARY KEY,
  name TEXT,
  location GEOMETRY(Point, 4326) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stops_location ON stops USING GIST (location);
CREATE INDEX IF NOT EXISTS idx_stops_name ON stops (name);

-- ============================================================================
-- Route-Stop Relationships
-- ============================================================================
CREATE TABLE IF NOT EXISTS route_stops (
  route_id TEXT NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
  stop_id TEXT NOT NULL REFERENCES stops(id) ON DELETE CASCADE,
  sequence_order INTEGER NOT NULL DEFAULT 0,
  route_progress DOUBLE PRECISION,
  PRIMARY KEY (route_id, stop_id)
);

CREATE INDEX IF NOT EXISTS idx_route_stops_route ON route_stops (route_id);
CREATE INDEX IF NOT EXISTS idx_route_stops_stop ON route_stops (stop_id);

-- ============================================================================
-- Boarding Sessions Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS boarding_sessions (
  id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
  route_id TEXT NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
  device_id TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  current_state mobility_state NOT NULL DEFAULT 'WAITING',
  current_progress DOUBLE PRECISION NOT NULL DEFAULT 0,
  current_speed DOUBLE PRECISION NOT NULL DEFAULT 0,
  last_sample_at TIMESTAMPTZ,
  virtual_vehicle_id TEXT,
  is_simulated BOOLEAN NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_sessions_route ON boarding_sessions (route_id);
CREATE INDEX IF NOT EXISTS idx_sessions_device ON boarding_sessions (device_id);
CREATE INDEX IF NOT EXISTS idx_sessions_active ON boarding_sessions (started_at DESC) WHERE ended_at IS NULL;

-- ============================================================================
-- Location Samples Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS location_samples (
  id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
  session_id TEXT NOT NULL REFERENCES boarding_sessions(id) ON DELETE CASCADE,
  timestamp BIGINT NOT NULL,
  location GEOMETRY(Point, 4326) NOT NULL,
  accuracy DOUBLE PRECISION NOT NULL,
  speed DOUBLE PRECISION,
  heading DOUBLE PRECISION,
  matched_route_id TEXT REFERENCES routes(id) ON DELETE SET NULL,
  route_progress DOUBLE PRECISION,
  distance_from_route DOUBLE PRECISION,
  inferred_speed DOUBLE PRECISION,
  mobility_state mobility_state,
  is_simulated BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_samples_location ON location_samples USING GIST (location);
CREATE INDEX IF NOT EXISTS idx_samples_session ON location_samples (session_id);
CREATE INDEX IF NOT EXISTS idx_samples_timestamp ON location_samples (timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_samples_created ON location_samples (created_at DESC);

-- ============================================================================
-- Virtual Vehicles Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS virtual_vehicles (
  id TEXT PRIMARY KEY,
  route_id TEXT NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
  progress DOUBLE PRECISION NOT NULL DEFAULT 0,
  speed DOUBLE PRECISION NOT NULL DEFAULT 0,
  heading DOUBLE PRECISION NOT NULL DEFAULT 0,
  passenger_count INTEGER NOT NULL DEFAULT 1,
  confidence confidence_level NOT NULL DEFAULT 'Media',
  current_location GEOMETRY(Point, 4326),
  last_update_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_simulated BOOLEAN NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_vehicles_route ON virtual_vehicles (route_id);
CREATE INDEX IF NOT EXISTS idx_vehicles_location ON virtual_vehicles USING GIST (current_location);
CREATE INDEX IF NOT EXISTS idx_vehicles_updated ON virtual_vehicles (last_update_at DESC);

-- ============================================================================
-- ETA Cache Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS eta_cache (
  stop_id TEXT NOT NULL REFERENCES stops(id) ON DELETE CASCADE,
  vehicle_id TEXT NOT NULL REFERENCES virtual_vehicles(id) ON DELETE CASCADE,
  min_minutes DOUBLE PRECISION NOT NULL,
  max_minutes DOUBLE PRECISION NOT NULL,
  confidence confidence_level NOT NULL,
  calculated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (stop_id, vehicle_id)
);

CREATE INDEX IF NOT EXISTS idx_eta_stop ON eta_cache (stop_id);

-- ============================================================================
-- Route Statistics Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS route_statistics (
  route_id TEXT NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
  time_bucket TIMESTAMPTZ NOT NULL,
  avg_speed DOUBLE PRECISION,
  sample_count INTEGER NOT NULL DEFAULT 0,
  passenger_count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (route_id, time_bucket)
);

-- ============================================================================
-- Spatial Functions
-- ============================================================================

-- Calculate progress along a route geometry (0.0 to 1.0)
CREATE OR REPLACE FUNCTION calculate_route_progress(
  route_geom GEOMETRY,
  point_geom GEOMETRY
) RETURNS DOUBLE PRECISION AS $$
DECLARE
  merged_line GEOMETRY;
BEGIN
  merged_line := ST_LineMerge(route_geom);
  IF ST_GeometryType(merged_line) = 'ST_LineString' THEN
    RETURN ST_LineLocatePoint(merged_line, ST_ClosestPoint(merged_line, point_geom));
  ELSE
    RETURN 0.0;
  END IF;
EXCEPTION WHEN OTHERS THEN
  RETURN 0.0;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Get position at progress along route
CREATE OR REPLACE FUNCTION position_at_progress(
  route_geom GEOMETRY,
  progress DOUBLE PRECISION
) RETURNS GEOMETRY AS $$
DECLARE
  merged_line GEOMETRY;
  clamped_progress DOUBLE PRECISION;
BEGIN
  clamped_progress := LEAST(GREATEST(progress, 0), 1);
  merged_line := ST_LineMerge(route_geom);
  IF ST_GeometryType(merged_line) = 'ST_LineString' THEN
    RETURN ST_LineInterpolatePoint(merged_line, clamped_progress);
  ELSE
    RETURN ST_Centroid(route_geom);
  END IF;
EXCEPTION WHEN OTHERS THEN
  RETURN ST_Centroid(route_geom);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Find routes near a point
CREATE OR REPLACE FUNCTION routes_near_point(
  point_lat DOUBLE PRECISION,
  point_lon DOUBLE PRECISION,
  corridor_meters DOUBLE PRECISION DEFAULT 100
) RETURNS TABLE (
  route_id TEXT,
  distance_meters DOUBLE PRECISION,
  progress DOUBLE PRECISION
) AS $$
DECLARE
  point_geom GEOMETRY;
BEGIN
  point_geom := ST_SetSRID(ST_MakePoint(point_lon, point_lat), 4326);

  RETURN QUERY
  SELECT
    r.id AS route_id,
    ST_Distance(r.geometry::geography, point_geom::geography) AS distance_meters,
    calculate_route_progress(r.geometry, point_geom) AS progress
  FROM routes r
  WHERE ST_DWithin(r.geometry::geography, point_geom::geography, corridor_meters)
  ORDER BY distance_meters
  LIMIT 10;
END;
$$ LANGUAGE plpgsql STABLE;

-- Mark migration as applied
INSERT INTO schema_migrations (version) VALUES ('002_schema') ON CONFLICT DO NOTHING;
