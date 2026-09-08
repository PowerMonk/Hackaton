-- ============================================================================
-- Location ingestion integrity and query indexes
-- ============================================================================

-- The route and sample queries cast geometry to geography for meter-based
-- distances. Functional GIST indexes keep those corridor lookups indexable.
CREATE INDEX IF NOT EXISTS idx_routes_geometry_geography
  ON routes USING GIST ((geometry::geography));

CREATE INDEX IF NOT EXISTS idx_stops_location_geography
  ON stops USING GIST ((location::geography));

CREATE INDEX IF NOT EXISTS idx_samples_location_geography
  ON location_samples USING GIST ((location::geography));

-- Ingestion and mobility queries normally scope by session/route and newest
-- samples. Partial indexes exclude rows that cannot participate in those
-- lookups while retaining the raw data.
CREATE INDEX IF NOT EXISTS idx_samples_session_timestamp
  ON location_samples (session_id, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_samples_route_timestamp
  ON location_samples (matched_route_id, timestamp DESC)
  WHERE matched_route_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_samples_live_created
  ON location_samples (created_at DESC)
  WHERE is_simulated = false;

CREATE INDEX IF NOT EXISTS idx_sessions_active_route_started
  ON boarding_sessions (route_id, started_at DESC)
  WHERE ended_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_sessions_active_device_started
  ON boarding_sessions (device_id, started_at DESC)
  WHERE ended_at IS NULL;

INSERT INTO schema_migrations (version)
VALUES ('003_integrity_indexes')
ON CONFLICT DO NOTHING;
