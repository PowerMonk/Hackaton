-- ============================================================================
-- Morelia Conecta Database Schema
-- PostgreSQL + PostGIS for spatial operations
-- ============================================================================

-- Mobility state enum
CREATE TYPE mobility_state AS ENUM (
  'IDLE',
  'WALKING',
  'WAITING',
  'IN_TRANSIT',
  'UNKNOWN'
);

-- Confidence level enum
CREATE TYPE confidence_level AS ENUM ('Alta', 'Media', 'Baja');

-- Transport mode enum
CREATE TYPE transport_mode AS ENUM ('Combi', 'Micro', 'Camión', 'Bus');

-- Data source enum
CREATE TYPE data_source AS ENUM ('osm-demo', 'gtfs', 'api', 'simulation');

-- ============================================================================
-- Routes Table
-- Stores transit route geometries from GeoJSON/GTFS
-- ============================================================================
CREATE TABLE routes (
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
  -- PostGIS geometry (SRID 4326 = WGS84)
  geometry GEOMETRY(MultiLineString, 4326) NOT NULL,
  total_length_m DOUBLE PRECISION NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Spatial index for route geometries
CREATE INDEX idx_routes_geometry ON routes USING GIST (geometry);
CREATE INDEX idx_routes_name ON routes (name);

-- ============================================================================
-- Stops Table
-- Transit stop points
-- ============================================================================
CREATE TABLE stops (
  id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
  name TEXT,
  -- PostGIS point geometry
  location GEOMETRY(Point, 4326) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Spatial index for stop locations
CREATE INDEX idx_stops_location ON stops USING GIST (location);

-- ============================================================================
-- Route-Stop Relationships
-- Which stops belong to which routes
-- ============================================================================
CREATE TABLE route_stops (
  route_id TEXT NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
  stop_id TEXT NOT NULL REFERENCES stops(id) ON DELETE CASCADE,
  sequence_order INTEGER NOT NULL DEFAULT 0,
  -- Progress along route geometry (0.0 to 1.0)
  route_progress DOUBLE PRECISION,
  PRIMARY KEY (route_id, stop_id)
);

CREATE INDEX idx_route_stops_route ON route_stops (route_id);
CREATE INDEX idx_route_stops_stop ON route_stops (stop_id);

-- ============================================================================
-- Boarding Sessions Table
-- Active passenger boarding sessions
-- ============================================================================
CREATE TABLE boarding_sessions (
  id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
  route_id TEXT NOT NULL REFERENCES routes(id),
  device_id TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  current_state mobility_state NOT NULL DEFAULT 'WAITING',
  current_progress DOUBLE PRECISION NOT NULL DEFAULT 0,
  current_speed DOUBLE PRECISION NOT NULL DEFAULT 0,
  last_sample_at TIMESTAMPTZ,
  virtual_vehicle_id TEXT,
  is_simulated BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sessions_route ON boarding_sessions (route_id);
CREATE INDEX idx_sessions_active ON boarding_sessions (ended_at) WHERE ended_at IS NULL;
CREATE INDEX idx_sessions_vehicle ON boarding_sessions (virtual_vehicle_id);

-- ============================================================================
-- Location Samples Table
-- GPS samples from passengers (short retention)
-- ============================================================================
CREATE TABLE location_samples (
  id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
  session_id TEXT NOT NULL REFERENCES boarding_sessions(id) ON DELETE CASCADE,
  timestamp BIGINT NOT NULL,
  -- PostGIS point for efficient spatial queries
  location GEOMETRY(Point, 4326) NOT NULL,
  accuracy DOUBLE PRECISION NOT NULL,
  speed DOUBLE PRECISION,
  heading DOUBLE PRECISION,
  -- Processing results
  matched_route_id TEXT REFERENCES routes(id),
  route_progress DOUBLE PRECISION,
  distance_from_route DOUBLE PRECISION,
  inferred_speed DOUBLE PRECISION,
  mobility_state mobility_state,
  is_simulated BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Spatial index for location queries
CREATE INDEX idx_samples_location ON location_samples USING GIST (location);
CREATE INDEX idx_samples_session ON location_samples (session_id);
CREATE INDEX idx_samples_timestamp ON location_samples (timestamp DESC);
-- Partial index for recent samples only
CREATE INDEX idx_samples_recent ON location_samples (created_at DESC)
  WHERE created_at > NOW() - INTERVAL '24 hours';

-- ============================================================================
-- Virtual Vehicles Table
-- Clustered passenger observations as inferred vehicles
-- ============================================================================
CREATE TABLE virtual_vehicles (
  id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
  route_id TEXT NOT NULL REFERENCES routes(id),
  progress DOUBLE PRECISION NOT NULL DEFAULT 0,
  speed DOUBLE PRECISION NOT NULL DEFAULT 0,
  heading DOUBLE PRECISION NOT NULL DEFAULT 0,
  passenger_count INTEGER NOT NULL DEFAULT 1,
  confidence confidence_level NOT NULL DEFAULT 'Media',
  -- Cached current position
  current_location GEOMETRY(Point, 4326),
  last_update_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_simulated BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_vehicles_route ON virtual_vehicles (route_id);
CREATE INDEX idx_vehicles_location ON virtual_vehicles USING GIST (current_location);
CREATE INDEX idx_vehicles_active ON virtual_vehicles (last_update_at DESC);

-- ============================================================================
-- ETA Cache Table
-- Pre-calculated ETAs for stops
-- ============================================================================
CREATE TABLE eta_cache (
  stop_id TEXT NOT NULL REFERENCES stops(id) ON DELETE CASCADE,
  vehicle_id TEXT NOT NULL REFERENCES virtual_vehicles(id) ON DELETE CASCADE,
  min_minutes DOUBLE PRECISION NOT NULL,
  max_minutes DOUBLE PRECISION NOT NULL,
  confidence confidence_level NOT NULL,
  calculated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (stop_id, vehicle_id)
);

CREATE INDEX idx_eta_cache_stop ON eta_cache (stop_id);
CREATE INDEX idx_eta_cache_recent ON eta_cache (calculated_at DESC);

-- ============================================================================
-- Aggregated Statistics (for dashboard)
-- ============================================================================
CREATE TABLE route_statistics (
  route_id TEXT NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
  time_bucket TIMESTAMPTZ NOT NULL,
  avg_speed DOUBLE PRECISION,
  sample_count INTEGER NOT NULL DEFAULT 0,
  passenger_count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (route_id, time_bucket)
);

CREATE INDEX idx_route_stats_bucket ON route_statistics (time_bucket DESC);

-- ============================================================================
-- Functions for Spatial Operations
-- ============================================================================

-- Calculate progress along a route geometry
CREATE OR REPLACE FUNCTION calculate_route_progress(
  route_geom GEOMETRY,
  point_geom GEOMETRY
) RETURNS DOUBLE PRECISION AS $$
DECLARE
  merged_line GEOMETRY;
BEGIN
  -- Merge MultiLineString to single LineString for progress calculation
  merged_line := ST_LineMerge(route_geom);
  IF ST_GeometryType(merged_line) = 'ST_LineString' THEN
    RETURN ST_LineLocatePoint(merged_line, ST_ClosestPoint(merged_line, point_geom));
  ELSE
    -- Fallback for non-mergeable geometries
    RETURN ST_LineLocatePoint(
      (SELECT ST_MakeLine(ST_StartPoint(geom), ST_EndPoint(geom))
       FROM ST_Dump(route_geom) AS dump(geom)
       ORDER BY dump.path LIMIT 1),
      point_geom
    );
  END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Get position at progress along route
CREATE OR REPLACE FUNCTION position_at_progress(
  route_geom GEOMETRY,
  progress DOUBLE PRECISION
) RETURNS GEOMETRY AS $$
DECLARE
  merged_line GEOMETRY;
BEGIN
  merged_line := ST_LineMerge(route_geom);
  IF ST_GeometryType(merged_line) = 'ST_LineString' THEN
    RETURN ST_LineInterpolatePoint(merged_line, LEAST(GREATEST(progress, 0), 1));
  ELSE
    RETURN ST_Centroid(route_geom);
  END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Find routes within corridor of a point
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
    r.id,
    ST_Distance(r.geometry::geography, point_geom::geography) as dist,
    calculate_route_progress(r.geometry, point_geom) as prog
  FROM routes r
  WHERE ST_DWithin(r.geometry::geography, point_geom::geography, corridor_meters)
  ORDER BY dist;
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================================================
-- Automatic cleanup of old samples (call periodically)
-- ============================================================================
CREATE OR REPLACE FUNCTION cleanup_old_samples(retention_hours INTEGER DEFAULT 72)
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM location_samples
  WHERE created_at < NOW() - (retention_hours || ' hours')::INTERVAL;

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;
