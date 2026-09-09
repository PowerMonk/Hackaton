import { sql } from "../db/connection";

export async function getDashboardRoutes() {
  const rows = await sql`
    SELECT
      r.id,
      r.ref,
      r.name,
      r.color,
      r.mode::text AS mode,
      COUNT(DISTINCT v.id)::int AS vehicles,
      COALESCE(ROUND(AVG(v.speed)::numeric, 1), 0)::float AS avg_speed,
      COUNT(DISTINCT ls.id)::int AS samples_24h,
      MAX(v.last_update_at) AS last_update_at
    FROM routes r
    LEFT JOIN virtual_vehicles v ON v.route_id = r.id
    LEFT JOIN location_samples ls
      ON ls.matched_route_id = r.id
      AND ls.created_at > NOW() - INTERVAL '24 hours'
    GROUP BY r.id
    ORDER BY r.name
  `;

  return rows.map((row) => ({
    id: row.id,
    ref: row.ref,
    name: row.name,
    color: row.color,
    mode: row.mode,
    vehicles: Number(row.vehicles),
    avgSpeed: Number(row.avg_speed),
    samples24h: Number(row.samples_24h),
    confidence: confidenceFor(Number(row.samples_24h), row.last_update_at),
    status: statusFor(row.last_update_at, Number(row.vehicles)),
    lastUpdateAt: row.last_update_at,
  }));
}

export async function getDashboardStops() {
  const rows = await sql`
    SELECT
      s.id,
      COALESCE(NULLIF(TRIM(s.name), ''), 'Parada ' || LEFT(s.id, 8)) AS name,
      ST_X(s.location)::float AS lon,
      ST_Y(s.location)::float AS lat,
      COUNT(DISTINCT rs.route_id)::int AS route_count,
      COALESCE(ARRAY_AGG(DISTINCT r.name) FILTER (WHERE r.name IS NOT NULL), ARRAY[]::text[]) AS route_names,
      COUNT(DISTINCT bs.id)::int AS active_sessions
    FROM stops s
    LEFT JOIN route_stops rs ON rs.stop_id = s.id
    LEFT JOIN routes r ON r.id = rs.route_id
    LEFT JOIN LATERAL (
      SELECT bs.id
      FROM boarding_sessions bs
      JOIN location_samples ls ON ls.session_id = bs.id
      WHERE bs.ended_at IS NULL
        AND ls.created_at > NOW() - INTERVAL '15 minutes'
        AND ST_DWithin(s.location::geography, ls.location::geography, 150)
      LIMIT 100
    ) bs ON true
    GROUP BY s.id
    ORDER BY active_sessions DESC, name
  `;

  return rows.map((row) => {
    const demand = Math.min(100, Number(row.active_sessions) * 18 + Number(row.route_count) * 4);
    return {
      id: row.id,
      name: row.name,
      coordinates: { lat: Number(row.lat), lon: Number(row.lon) },
      routeCount: Number(row.route_count),
      routeNames: row.route_names || [],
      activeSessions: Number(row.active_sessions),
      estimatedDemand: demand,
      confidence: Number(row.active_sessions) > 0 ? "Media" : "Baja",
    };
  });
}

export async function getDashboardHistory(routeId?: string) {
  const rows = routeId
    ? await sql`
        SELECT date_trunc('hour', created_at) AS bucket,
               COUNT(*)::int AS samples,
               COALESCE(AVG(inferred_speed), 0)::float AS avg_speed
        FROM location_samples
        WHERE matched_route_id = ${routeId}
          AND created_at > NOW() - INTERVAL '24 hours'
        GROUP BY 1 ORDER BY 1
      `
    : await sql`
        SELECT date_trunc('hour', created_at) AS bucket,
               COUNT(*)::int AS samples,
               COALESCE(AVG(inferred_speed), 0)::float AS avg_speed
        FROM location_samples
        WHERE created_at > NOW() - INTERVAL '24 hours'
        GROUP BY 1 ORDER BY 1
      `;

  return rows.map((row) => ({
    bucket: row.bucket,
    samples: Number(row.samples),
    avgSpeed: Number(row.avg_speed),
  }));
}

export async function getDashboardAlerts() {
  const routes = await getDashboardRoutes();
  return routes
    .filter((route) => route.status !== "Normal")
    .slice(0, 20)
    .map((route) => ({
      id: `route-${route.id}`,
      type: route.status === "Sin datos" ? "stale_signal" : "route_attention",
      severity: route.status === "Sin datos" ? "high" : "medium",
      title: route.status === "Sin datos" ? `Sin señales en ${route.name}` : `Atención en ${route.name}`,
      routeId: route.id,
      lastUpdateAt: route.lastUpdateAt,
      message: route.status === "Sin datos" ? "No hay vehículos sincronizados recientemente." : "La ruta requiere revisión operativa.",
    }));
}

export async function getDashboardQuality() {
  const [totals] = await sql`
    SELECT
      COUNT(*)::int AS total_samples,
      COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '90 seconds')::int AS recent_samples,
      COUNT(*) FILTER (WHERE is_simulated)::int AS simulated_samples
    FROM location_samples
    WHERE created_at > NOW() - INTERVAL '24 hours'
  `;
  const [sessions] = await sql`
    SELECT COUNT(*) FILTER (WHERE ended_at IS NULL)::int AS active_sessions
    FROM boarding_sessions
  `;
  const routes = await getDashboardRoutes();
  const total = Number(totals?.total_samples ?? 0);
  const recent = Number(totals?.recent_samples ?? 0);

  return {
    totalSamples: total,
    recentSamples: recent,
    staleSamples: Math.max(0, total - recent),
    simulatedSamples: Number(totals?.simulated_samples ?? 0),
    activeSessions: Number(sessions?.active_sessions ?? 0),
    freshness: total === 0 ? 0 : Math.round((recent / total) * 100),
    routes,
  };
}

function confidenceFor(samples: number, lastUpdate: unknown): "Alta" | "Media" | "Baja" {
  if (!lastUpdate) return "Baja";
  const age = Date.now() - new Date(String(lastUpdate)).getTime();
  if (samples >= 20 && age < 90_000) return "Alta";
  if (samples > 0 && age < 300_000) return "Media";
  return "Baja";
}

function statusFor(lastUpdate: unknown, vehicles: number): "Normal" | "Atención" | "Sin datos" {
  if (vehicles === 0 || !lastUpdate) return "Sin datos";
  return Date.now() - new Date(String(lastUpdate)).getTime() > 180_000 ? "Atención" : "Normal";
}
