-- ============================================================================
-- Proximity detection support
-- ============================================================================

-- Add last_stop_id to track the most recent stop the user was at
ALTER TABLE boarding_sessions
ADD COLUMN IF NOT EXISTS last_stop_id TEXT REFERENCES stops(id);

-- Add destination_stop_id for destination alerts
ALTER TABLE boarding_sessions
ADD COLUMN IF NOT EXISTS destination_stop_id TEXT REFERENCES stops(id);

-- Index for quick lookups
CREATE INDEX IF NOT EXISTS idx_sessions_last_stop
  ON boarding_sessions (last_stop_id)
  WHERE last_stop_id IS NOT NULL;

-- Track proximity events for analytics
CREATE TABLE IF NOT EXISTS proximity_events (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  session_id TEXT NOT NULL REFERENCES boarding_sessions(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('near_stop', 'at_stop', 'boarding_likely', 'on_vehicle', 'alighting_likely')),
  stop_id TEXT REFERENCES stops(id),
  route_id TEXT,
  confidence TEXT NOT NULL CHECK (confidence IN ('Alta', 'Media', 'Baja')),
  message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_proximity_events_session
  ON proximity_events (session_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_proximity_events_type
  ON proximity_events (event_type, created_at DESC);

INSERT INTO schema_migrations (version)
VALUES ('005_proximity')
ON CONFLICT DO NOTHING;
