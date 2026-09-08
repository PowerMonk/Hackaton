-- ============================================================================
-- Performance indexes for common query patterns
-- ============================================================================

-- Vehicle queries often filter by is_simulated and recent last_update_at
CREATE INDEX IF NOT EXISTS idx_vehicles_live_recent
  ON virtual_vehicles (route_id, last_update_at DESC)
  WHERE is_simulated = false;

CREATE INDEX IF NOT EXISTS idx_vehicles_simulated_recent
  ON virtual_vehicles (route_id, last_update_at DESC)
  WHERE is_simulated = true;

-- Speed history lookups for ETA calculation
CREATE INDEX IF NOT EXISTS idx_samples_vehicle_speed
  ON location_samples (session_id, timestamp DESC)
  WHERE is_simulated = false AND inferred_speed IS NOT NULL;

-- Route stops ordered by progress for stop counting
CREATE INDEX IF NOT EXISTS idx_route_stops_progress
  ON route_stops (route_id, route_progress);

-- Composite index for the refreshLiveVehicles query
CREATE INDEX IF NOT EXISTS idx_samples_live_session_route_timestamp
  ON location_samples (session_id, matched_route_id, timestamp DESC)
  WHERE is_simulated = false
    AND matched_route_id IS NOT NULL
    AND route_progress IS NOT NULL;

-- Index for boarding session vehicle assignment lookups
CREATE INDEX IF NOT EXISTS idx_sessions_vehicle
  ON boarding_sessions (virtual_vehicle_id)
  WHERE virtual_vehicle_id IS NOT NULL AND ended_at IS NULL;

INSERT INTO schema_migrations (version)
VALUES ('004_performance')
ON CONFLICT DO NOTHING;
