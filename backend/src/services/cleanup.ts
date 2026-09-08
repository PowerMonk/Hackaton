// ============================================================================
// Data Cleanup Service
// Manages old data to maintain database performance
// ============================================================================

import { sql } from "../db/connection";

export interface CleanupResult {
  samplesDeleted: number;
  sessionsDeleted: number;
  staleVehiclesDeleted: number;
  etaCacheDeleted: number;
}

export interface CleanupOptions {
  /** Max age for location samples in hours (default: 24) */
  sampleMaxAgeHours?: number;
  /** Max age for ended sessions in hours (default: 48) */
  sessionMaxAgeHours?: number;
  /** Max age for stale vehicles in minutes (default: 5) */
  staleVehicleMinutes?: number;
  /** Max age for ETA cache in minutes (default: 2) */
  etaCacheMinutes?: number;
  /** Dry run - log what would be deleted without deleting */
  dryRun?: boolean;
}

const DEFAULT_OPTIONS: Required<CleanupOptions> = {
  sampleMaxAgeHours: 24,
  sessionMaxAgeHours: 48,
  staleVehicleMinutes: 5,
  etaCacheMinutes: 2,
  dryRun: false,
};

/**
 * Clean up old data to maintain database performance.
 * Should be run periodically (e.g., every hour).
 */
export async function cleanupOldData(
  options: CleanupOptions = {}
): Promise<CleanupResult> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  const result: CleanupResult = {
    samplesDeleted: 0,
    sessionsDeleted: 0,
    staleVehiclesDeleted: 0,
    etaCacheDeleted: 0,
  };

  // Calculate cutoff timestamps
  const sampleCutoff = new Date(Date.now() - opts.sampleMaxAgeHours * 60 * 60 * 1000);
  const sessionCutoff = new Date(Date.now() - opts.sessionMaxAgeHours * 60 * 60 * 1000);
  const vehicleCutoff = new Date(Date.now() - opts.staleVehicleMinutes * 60 * 1000);
  const etaCutoff = new Date(Date.now() - opts.etaCacheMinutes * 60 * 1000);

  // Delete old location samples
  if (opts.dryRun) {
    const [count] = await sql`
      SELECT COUNT(*) as count
      FROM location_samples
      WHERE created_at < ${sampleCutoff}
    `;
    result.samplesDeleted = Number(count?.count ?? 0);
  } else {
    const deleted = await sql`
      DELETE FROM location_samples
      WHERE created_at < ${sampleCutoff}
      RETURNING id
    `;
    result.samplesDeleted = deleted.length;
  }

  // Delete old ended sessions (keep active ones)
  if (opts.dryRun) {
    const [count] = await sql`
      SELECT COUNT(*) as count
      FROM boarding_sessions
      WHERE ended_at IS NOT NULL
        AND ended_at < ${sessionCutoff}
    `;
    result.sessionsDeleted = Number(count?.count ?? 0);
  } else {
    const deleted = await sql`
      DELETE FROM boarding_sessions
      WHERE ended_at IS NOT NULL
        AND ended_at < ${sessionCutoff}
      RETURNING id
    `;
    result.sessionsDeleted = deleted.length;
  }

  // Delete stale virtual vehicles (not updated recently)
  if (opts.dryRun) {
    const [count] = await sql`
      SELECT COUNT(*) as count
      FROM virtual_vehicles
      WHERE last_update_at < ${vehicleCutoff}
    `;
    result.staleVehiclesDeleted = Number(count?.count ?? 0);
  } else {
    const deleted = await sql`
      DELETE FROM virtual_vehicles
      WHERE last_update_at < ${vehicleCutoff}
      RETURNING id
    `;
    result.staleVehiclesDeleted = deleted.length;
  }

  // Delete old ETA cache entries
  if (opts.dryRun) {
    const [count] = await sql`
      SELECT COUNT(*) as count
      FROM eta_cache
      WHERE calculated_at < ${etaCutoff}
    `;
    result.etaCacheDeleted = Number(count?.count ?? 0);
  } else {
    const deleted = await sql`
      DELETE FROM eta_cache
      WHERE calculated_at < ${etaCutoff}
      RETURNING stop_id
    `;
    result.etaCacheDeleted = deleted.length;
  }

  return result;
}

/**
 * Vacuum analyze tables for better query performance.
 * Should be run during low-traffic periods.
 */
export async function vacuumTables(): Promise<void> {
  // VACUUM ANALYZE cannot run in a transaction, so we use unsafe
  await sql.unsafe("VACUUM ANALYZE location_samples");
  await sql.unsafe("VACUUM ANALYZE boarding_sessions");
  await sql.unsafe("VACUUM ANALYZE virtual_vehicles");
  await sql.unsafe("VACUUM ANALYZE eta_cache");
}

/**
 * Get database statistics for monitoring.
 */
export async function getDatabaseStats(): Promise<{
  totalSamples: number;
  recentSamples: number;
  activeSessions: number;
  totalSessions: number;
  activeVehicles: number;
  totalVehicles: number;
  tableSize: Record<string, string>;
}> {
  const [samples] = await sql`
    SELECT
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '1 hour') as recent
    FROM location_samples
  `;

  const [sessions] = await sql`
    SELECT
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE ended_at IS NULL) as active
    FROM boarding_sessions
  `;

  const [vehicles] = await sql`
    SELECT
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE last_update_at > NOW() - INTERVAL '2 minutes') as active
    FROM virtual_vehicles
  `;

  const tableSizes = await sql`
    SELECT
      relname as table_name,
      pg_size_pretty(pg_total_relation_size(relid)) as total_size
    FROM pg_catalog.pg_statio_user_tables
    WHERE schemaname = 'public'
    ORDER BY pg_total_relation_size(relid) DESC
  `;

  const tableSize: Record<string, string> = {};
  for (const row of tableSizes) {
    tableSize[row.table_name] = row.total_size;
  }

  return {
    totalSamples: Number(samples?.total ?? 0),
    recentSamples: Number(samples?.recent ?? 0),
    activeSessions: Number(sessions?.active ?? 0),
    totalSessions: Number(sessions?.total ?? 0),
    activeVehicles: Number(vehicles?.active ?? 0),
    totalVehicles: Number(vehicles?.total ?? 0),
    tableSize,
  };
}
