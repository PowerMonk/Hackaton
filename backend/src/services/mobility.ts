// ============================================================================
// Mobility Service
// Handles boarding sessions, location processing, and ETA calculation
// ============================================================================

import { sql } from "../db/connection";
import type {
  BoardingSession,
  LocationSample,
  ProcessedSample,
  VirtualVehicle,
  EtaResult,
  MobilityState,
} from "../types";
import { getSimulation } from "../simulation/engine";
import {
  calculateEta as calculateEtaEstimate,
  selectBestVehicleEta,
  type VehicleCandidate,
} from "./eta";
import {
  clusterVehicleObservations,
  type VehicleCluster,
  type VehicleObservation,
} from "./vehicle-clustering";
import { broadcastVehicleUpdate } from "../routes/websocket";

export interface LocationProcessingResult extends ProcessedSample {
  persisted: boolean;
  virtualVehicleId: string | null;
  confidence: VirtualVehicle["confidence"] | null;
}

interface LiveObservationRow {
  session_id: string;
  route_id: string;
  progress: number;
  speed_kmh: number | null;
  heading: number | null;
  observed_at: number;
  route_length_m: number;
}

interface LiveVehicleIdentity {
  vehicleId: string;
  confidence: VirtualVehicle["confidence"];
  sessionIds: string[];
}

const LIVE_SAMPLE_MAX_AGE_SECONDS = 90;
const MAX_LIVE_OBSERVATIONS = 500;
const MAX_LIVE_VEHICLES = 500;

function isDemoMode(): boolean {
  return (process.env.MOBILITY_MODE || "demo") === "demo";
}

// ============================================================================
// Boarding Sessions
// ============================================================================

export async function createBoardingSession(
  routeId: string,
  deviceId: string,
  isSimulated: boolean = false
): Promise<BoardingSession> {
  const result = await sql`
    INSERT INTO boarding_sessions (route_id, device_id, is_simulated)
    VALUES (${routeId}, ${deviceId}, ${isSimulated})
    RETURNING
      id, route_id, device_id, started_at, ended_at,
      current_state::text, current_progress, current_speed,
      last_sample_at, virtual_vehicle_id, is_simulated
  `;

  return mapSession(result[0]);
}

export async function getSession(sessionId: string): Promise<BoardingSession | null> {
  const result = await sql`
    SELECT
      id, route_id, device_id, started_at, ended_at,
      current_state::text, current_progress, current_speed,
      last_sample_at, virtual_vehicle_id, is_simulated
    FROM boarding_sessions
    WHERE id = ${sessionId}
    LIMIT 1
  `;

  if (result.length === 0) return null;
  return mapSession(result[0]);
}

export async function endSession(sessionId: string): Promise<boolean> {
  const result = await sql`
    UPDATE boarding_sessions
    SET ended_at = NOW()
    WHERE id = ${sessionId} AND ended_at IS NULL
    RETURNING id
  `;

  return result.length > 0;
}

export async function getActiveSessions(routeId?: string): Promise<BoardingSession[]> {
  let result;

  if (routeId) {
    result = await sql`
      SELECT
        id, route_id, device_id, started_at, ended_at,
        current_state::text, current_progress, current_speed,
        last_sample_at, virtual_vehicle_id, is_simulated
      FROM boarding_sessions
      WHERE ended_at IS NULL AND route_id = ${routeId}
      ORDER BY started_at DESC
      LIMIT 500
    `;
  } else {
    result = await sql`
      SELECT
        id, route_id, device_id, started_at, ended_at,
        current_state::text, current_progress, current_speed,
        last_sample_at, virtual_vehicle_id, is_simulated
      FROM boarding_sessions
      WHERE ended_at IS NULL
      ORDER BY started_at DESC
      LIMIT 500
    `;
  }

  return result.map(mapSession);
}

function mapSession(row: Record<string, unknown>): BoardingSession {
  return {
    id: row.id as string,
    routeId: row.route_id as string,
    deviceId: row.device_id as string,
    startedAt: row.started_at as Date,
    endedAt: row.ended_at as Date | null,
    currentState: row.current_state as MobilityState,
    currentProgress: Number(row.current_progress),
    currentSpeed: Number(row.current_speed),
    lastSampleAt: row.last_sample_at as Date | null,
    virtualVehicleId: row.virtual_vehicle_id as string | null,
    isSimulated: Boolean(row.is_simulated),
  };
}

// ============================================================================
// Location Processing
// ============================================================================

export async function processLocationSample(
  sample: LocationSample
): Promise<LocationProcessingResult> {
  // Find matching route using PostGIS
  const routeMatch = await sql`
    SELECT route_id, distance_meters, progress
    FROM routes_near_point(${sample.lat}, ${sample.lon}, 100)
    LIMIT 1
  `;

  let matchedRouteId: string | null = null;
  let routeProgress: number | null = null;
  let distanceFromRoute: number | null = null;

  if (routeMatch.length > 0) {
    matchedRouteId = routeMatch[0].route_id;
    routeProgress = Number(routeMatch[0].progress);
    distanceFromRoute = Number(routeMatch[0].distance_meters);
  }

  // Infer mobility state
  const mobilityState = inferMobilityState(sample, distanceFromRoute);

  // Speed in km/h for storage (convert from m/s if provided)
  const speedKmh = sample.speed === undefined ? null : sample.speed * 3.6;

  // The simulation engine can emit deterministic session IDs without first
  // calling the HTTP boarding endpoint. Live samples must always reference an
  // active, previously created session.
  let sessionExists = false;
  if (sample.isSimulated && matchedRouteId) {
    await sql`
      INSERT INTO boarding_sessions (
        id, route_id, device_id, current_state, current_progress,
        current_speed, is_simulated
      ) VALUES (
        ${sample.sessionId},
        ${matchedRouteId},
        ${`simulation-${sample.sessionId}`},
        ${mobilityState}::mobility_state,
        ${routeProgress ?? 0},
        ${speedKmh ?? 0},
        true
      )
      ON CONFLICT (id) DO NOTHING
    `;
    const simulationSession = await sql`
      SELECT id
      FROM boarding_sessions
      WHERE id = ${sample.sessionId}
        AND ended_at IS NULL
        AND is_simulated = true
      LIMIT 1
    `;
    sessionExists = simulationSession.length > 0;
  } else {
    const session = await sql`
      SELECT id
      FROM boarding_sessions
      WHERE id = ${sample.sessionId}
        AND ended_at IS NULL
        AND is_simulated = false
      LIMIT 1
    `;
    sessionExists = session.length > 0;
  }

  if (!sessionExists) {
    return {
      ...sample,
      matchedRouteId,
      routeProgress,
      distanceFromRoute,
      inferredSpeed: speedKmh,
      mobilityState,
      persisted: false,
      virtualVehicleId: null,
      confidence: null,
    };
  }

  // Insert sample
  await sql`
    INSERT INTO location_samples (
      session_id, timestamp, location, accuracy, speed, heading,
      matched_route_id, route_progress, distance_from_route,
      inferred_speed, mobility_state, is_simulated
    ) VALUES (
      ${sample.sessionId},
      ${sample.timestamp},
      ST_SetSRID(ST_MakePoint(${sample.lon}, ${sample.lat}), 4326),
      ${sample.accuracy},
      ${speedKmh},
      ${sample.heading ?? null},
      ${matchedRouteId},
      ${routeProgress},
      ${distanceFromRoute},
      ${speedKmh},
      ${mobilityState}::mobility_state,
      ${sample.isSimulated}
    )
  `;

  // Update session
  await sql`
    UPDATE boarding_sessions
    SET
      current_state = ${mobilityState}::mobility_state,
      current_progress = COALESCE(${routeProgress}, current_progress),
      current_speed = COALESCE(${speedKmh}, current_speed),
      last_sample_at = NOW()
    WHERE id = ${sample.sessionId} AND ended_at IS NULL
  `;

  let virtualVehicleId: string | null = null;
  let confidence: VirtualVehicle["confidence"] | null = null;

  if (!sample.isSimulated && matchedRouteId !== null && routeProgress !== null) {
    const identities = await refreshLiveVehicles();
    const identity = identities.get(sample.sessionId);
    virtualVehicleId = identity?.vehicleId ?? null;
    confidence = identity?.confidence ?? null;

    // Broadcast the persisted LIVE snapshot, not the raw passenger sample.
    // This keeps WebSocket and HTTP vehicle shapes identical.
    const vehicles = await readLiveVehicles(matchedRouteId);
    broadcastVehicleUpdate(vehicles);
  }

  return {
    ...sample,
    matchedRouteId,
    routeProgress,
    distanceFromRoute,
    inferredSpeed: speedKmh,
    mobilityState,
    persisted: true,
    virtualVehicleId,
    confidence,
  };
}

function inferMobilityState(
  sample: LocationSample,
  distanceFromRoute: number | null
): MobilityState {
  // Speed in m/s
  const speedMs = sample.speed || 0;
  // Convert to km/h for thresholds
  const speedKmh = speedMs * 3.6;

  if (distanceFromRoute === null || distanceFromRoute > 50) {
    if (speedKmh < 2) return "IDLE";
    if (speedKmh < 7) return "WALKING";
    return "UNKNOWN";
  }

  if (speedKmh < 2) return "WAITING";
  if (speedKmh >= 2 && speedKmh <= 60) return "IN_TRANSIT";

  return "UNKNOWN";
}

// ============================================================================
// Virtual Vehicles
// ============================================================================

export async function getVirtualVehicles(routeId?: string): Promise<VirtualVehicle[]> {
  if (isDemoMode()) {
    const simulation = getSimulation();
    if (routeId) {
      return simulation.getRouteVehicles(routeId);
    }
    return simulation.getVirtualVehicles();
  }

  // Reconcile recent samples on reads as well as on ingestion. This covers a
  // process restart where samples exist but the in-memory integration state
  // does not.
  await refreshLiveVehicles();
  return readLiveVehicles(routeId);
}

export async function syncVehiclesToDatabase(vehicles: VirtualVehicle[]): Promise<void> {
  for (const vehicle of vehicles) {
    await sql`
      INSERT INTO virtual_vehicles (
        id, route_id, progress, speed, heading,
        passenger_count, confidence, current_location,
        last_update_at, is_simulated
      ) VALUES (
        ${vehicle.id},
        ${vehicle.routeId},
        ${vehicle.progress},
        ${vehicle.speed},
        ${vehicle.heading},
        ${vehicle.passengerCount},
        ${vehicle.confidence}::confidence_level,
        ST_SetSRID(ST_MakePoint(${vehicle.currentPosition.lon}, ${vehicle.currentPosition.lat}), 4326),
        NOW(),
        ${vehicle.isSimulated}
      )
      ON CONFLICT (id) DO UPDATE SET
        progress = EXCLUDED.progress,
        speed = EXCLUDED.speed,
        heading = EXCLUDED.heading,
        passenger_count = EXCLUDED.passenger_count,
        confidence = EXCLUDED.confidence,
        current_location = EXCLUDED.current_location,
        last_update_at = NOW()
    `;
  }
}

async function refreshLiveVehicles(): Promise<Map<string, LiveVehicleIdentity>> {
  const now = Date.now();
  const rows = await sql`
    SELECT
      latest.session_id,
      latest.route_id,
      latest.progress,
      latest.speed_kmh,
      latest.heading,
      latest.observed_at,
      r.total_length_m AS route_length_m
    FROM (
      SELECT DISTINCT ON (ls.session_id)
        ls.session_id,
        ls.matched_route_id AS route_id,
        ls.route_progress AS progress,
        ls.inferred_speed AS speed_kmh,
        ls.heading,
        ls.timestamp AS observed_at
      FROM location_samples ls
      INNER JOIN boarding_sessions bs ON bs.id = ls.session_id
      WHERE ls.is_simulated = false
        AND bs.is_simulated = false
        AND bs.ended_at IS NULL
        AND ls.matched_route_id IS NOT NULL
        AND ls.route_progress IS NOT NULL
        AND ls.timestamp >= ${now - LIVE_SAMPLE_MAX_AGE_SECONDS * 1000}
      ORDER BY ls.session_id, ls.timestamp DESC, ls.created_at DESC
      LIMIT ${MAX_LIVE_OBSERVATIONS}
    ) latest
    INNER JOIN routes r ON r.id = latest.route_id
    WHERE r.total_length_m > 0
    ORDER BY latest.route_id, latest.session_id
  `;

  const observations: VehicleObservation[] = (rows as unknown as LiveObservationRow[]).map((row) => ({
    sessionId: row.session_id,
    routeId: row.route_id,
    progress: Number(row.progress),
    speedKmh: Number(row.speed_kmh ?? 0),
    heading: row.heading === null ? null : Number(row.heading),
    observedAt: Number(row.observed_at),
    routeLengthM: Number(row.route_length_m),
  }));

  const clusters = clusterVehicleObservations(observations, {
    now,
    maxAgeSeconds: LIVE_SAMPLE_MAX_AGE_SECONDS,
  }).slice(0, MAX_LIVE_VEHICLES);
  const identities = new Map<string, LiveVehicleIdentity>();
  const activeVehicleIds: string[] = [];

  for (const cluster of clusters) {
    const identity = await persistLiveCluster(cluster);
    activeVehicleIds.push(identity.vehicleId);
    for (const observation of cluster.observations) {
      if (observation.sessionId) identities.set(observation.sessionId, identity);
    }
  }

  // A cluster split must not leave its former vehicle visible for the rest of
  // the freshness window. Inferred rows are retained for diagnostics but made
  // stale when they are not part of this reconciliation pass.
  if (activeVehicleIds.length === 0) {
    await sql`
      UPDATE virtual_vehicles
      SET last_update_at = NOW() - INTERVAL '91 seconds'
      WHERE is_simulated = false
        AND last_update_at >= NOW() - INTERVAL '90 seconds'
    `;
  } else {
    await sql`
      UPDATE virtual_vehicles
      SET last_update_at = NOW() - INTERVAL '91 seconds'
      WHERE is_simulated = false
        AND last_update_at >= NOW() - INTERVAL '90 seconds'
        AND NOT (id = ANY(${activeVehicleIds}))
    `;
  }

  return identities;
}

async function persistLiveCluster(cluster: VehicleCluster): Promise<LiveVehicleIdentity> {
  const sessionIds = cluster.observations
    .map((observation) => observation.sessionId)
    .filter((sessionId): sessionId is string => Boolean(sessionId))
    .sort();
  const vehicleId = deterministicClusterId(cluster.routeId, sessionIds);
  const confidence: VirtualVehicle["confidence"] =
    cluster.observations.length >= 3
      ? "Alta"
      : cluster.observations.length === 2
        ? "Media"
        : "Baja";

  await sql`
    INSERT INTO virtual_vehicles (
      id, route_id, progress, speed, heading,
      passenger_count, confidence, current_location,
      last_update_at, is_simulated
    )
    SELECT
      ${vehicleId},
      ${cluster.routeId},
      ${cluster.progress},
      ${cluster.speedKmh},
      ${cluster.heading ?? 0},
      ${cluster.observations.length},
      ${confidence}::confidence_level,
      position_at_progress(r.geometry, ${cluster.progress}),
      ${cluster.lastObservedAt},
      false
    FROM routes r
    WHERE r.id = ${cluster.routeId}
    ON CONFLICT (id) DO UPDATE SET
      route_id = EXCLUDED.route_id,
      progress = EXCLUDED.progress,
      speed = EXCLUDED.speed,
      heading = EXCLUDED.heading,
      passenger_count = EXCLUDED.passenger_count,
      confidence = EXCLUDED.confidence,
      current_location = EXCLUDED.current_location,
      last_update_at = EXCLUDED.last_update_at,
      is_simulated = false
  `;

  if (sessionIds.length > 0) {
    for (const sessionId of sessionIds) {
      await sql`
        UPDATE boarding_sessions
        SET virtual_vehicle_id = ${vehicleId}
        WHERE id = ${sessionId} AND ended_at IS NULL
      `;
    }
  }

  return { vehicleId, confidence, sessionIds };
}

function deterministicClusterId(routeId: string, sessionIds: string[]): string {
  let hash = 2_166_136_261;
  const value = `${routeId}:${sessionIds.join(",")}`;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return `live-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

async function readLiveVehicles(routeId?: string): Promise<VirtualVehicle[]> {
  const result = routeId
    ? await sql`
        SELECT
          id, route_id, progress, speed, heading, passenger_count,
          confidence::text, ST_X(current_location) AS lon,
          ST_Y(current_location) AS lat, last_update_at, is_simulated
        FROM virtual_vehicles
        WHERE is_simulated = false
          AND route_id = ${routeId}
          AND current_location IS NOT NULL
          AND last_update_at >= NOW() - INTERVAL '90 seconds'
        ORDER BY last_update_at DESC
        LIMIT ${MAX_LIVE_VEHICLES}
      `
    : await sql`
        SELECT
          id, route_id, progress, speed, heading, passenger_count,
          confidence::text, ST_X(current_location) AS lon,
          ST_Y(current_location) AS lat, last_update_at, is_simulated
        FROM virtual_vehicles
        WHERE is_simulated = false
          AND current_location IS NOT NULL
          AND last_update_at >= NOW() - INTERVAL '90 seconds'
        ORDER BY last_update_at DESC
        LIMIT ${MAX_LIVE_VEHICLES}
      `;

  return result.map((row) => ({
    id: row.id as string,
    routeId: row.route_id as string,
    progress: Number(row.progress),
    speed: Number(row.speed),
    heading: Number(row.heading),
    passengerCount: Number(row.passenger_count),
    confidence: row.confidence as VirtualVehicle["confidence"],
    lastUpdateAt: row.last_update_at as Date,
    currentPosition: { lat: Number(row.lat), lon: Number(row.lon) },
    isSimulated: Boolean(row.is_simulated),
  }));
}

// ============================================================================
// ETA Calculation
// ============================================================================

export async function calculateStopEta(
  stopId: string,
  routeId?: string
): Promise<EtaResult | null> {
  // Get stop location
  const stopResult = await sql`
    SELECT id, ST_X(location) as lon, ST_Y(location) as lat
    FROM stops
    WHERE id = ${stopId}
    LIMIT 1
  `;

  if (stopResult.length === 0) return null;

  const stop = stopResult[0];

  // Prefer the explicit route_stops progress. It is based on the imported
  // stop sequence and is more stable than projecting the point again.
  let routeMatch;
  if (routeId) {
    routeMatch = await sql`
      SELECT
        r.id as route_id,
        COALESCE(
          rs.route_progress,
          calculate_route_progress(r.geometry, ST_SetSRID(ST_MakePoint(${stop.lon}, ${stop.lat}), 4326))
        ) as progress,
        r.total_length_m as route_length_m
      FROM routes r
      LEFT JOIN route_stops rs ON rs.route_id = r.id AND rs.stop_id = ${stopId}
      WHERE r.id = ${routeId}
      LIMIT 1
    `;
  } else {
    routeMatch = await sql`
      SELECT
        r.id as route_id,
        COALESCE(
          rs.route_progress,
          calculate_route_progress(r.geometry, ST_SetSRID(ST_MakePoint(${stop.lon}, ${stop.lat}), 4326))
        ) as progress,
        r.total_length_m as route_length_m
      FROM route_stops rs
      INNER JOIN routes r ON r.id = rs.route_id
      WHERE rs.stop_id = ${stopId}
      ORDER BY rs.sequence_order
      LIMIT 1
    `;

    if (routeMatch.length === 0) {
      routeMatch = await sql`
        SELECT near_route.route_id, near_route.progress, r.total_length_m as route_length_m
        FROM routes_near_point(${stop.lat}, ${stop.lon}, 200) near_route
        INNER JOIN routes r ON r.id = near_route.route_id
        LIMIT 1
      `;
    }
  }

  if (routeMatch.length === 0) {
    return {
      minMinutes: 10,
      maxMinutes: 20,
      label: "10-20 min",
      confidence: "Baja",
      vehicleId: null,
      stale: true,
      calculatedAt: new Date(),
    };
  }

  const matchedRouteId = routeMatch[0].route_id;
  const stopProgress = Number(routeMatch[0].progress);
  const routeLengthM = Number(routeMatch[0].route_length_m);

  if (!Number.isFinite(routeLengthM) || routeLengthM <= 0) {
    return {
      minMinutes: 5,
      maxMinutes: 15,
      label: "5-15 min",
      confidence: "Baja",
      vehicleId: null,
      stale: true,
      calculatedAt: new Date(),
    };
  }

  // Get all vehicles on this route
  const vehicles = await getVirtualVehicles(matchedRouteId);

  if (vehicles.length === 0) {
    return {
      minMinutes: 10,
      maxMinutes: 20,
      label: "10-20 min",
      confidence: "Baja",
      vehicleId: null,
      stale: true,
      calculatedAt: new Date(),
    };
  }

  // Convert to VehicleCandidate format for multi-vehicle selection
  const candidates: VehicleCandidate[] = await Promise.all(
    vehicles.map(async (v) => {
      const speedHistory = v.isSimulated ? [] : await getVehicleSpeedHistory(v.id);
      return {
        id: v.id,
        progress: v.progress,
        speedKmh: v.speed,
        speedHistoryKmh: speedHistory,
        lastObservedAt: v.lastUpdateAt,
        state: v.state ?? (v.speed < 3 ? "paused" : "moving"),
        passengerCount: v.passengerCount,
      };
    })
  );

  // Count estimated stops along the route (for dwell time calculation)
  const stopsOnRoute = await getStopCountForRoute(matchedRouteId);

  // Use the new multi-vehicle ETA selection
  const bestEta = selectBestVehicleEta(
    candidates,
    stopProgress,
    routeLengthM,
    matchedRouteId,
    {
      allowNextLoop: true,
      stopsPerRoute: stopsOnRoute,
      dwellSeconds: 20, // Average dwell time per stop
      minMovingSpeedKmh: 3,
      fallbackSpeedKmh: 15,
    }
  );

  if (!bestEta) {
    return {
      minMinutes: 10,
      maxMinutes: 20,
      label: "10-20 min",
      confidence: "Baja",
      vehicleId: null,
      stale: true,
      calculatedAt: new Date(),
    };
  }

  return {
    minMinutes: bestEta.minMinutes,
    maxMinutes: bestEta.maxMinutes,
    label: bestEta.label,
    confidence: bestEta.confidence,
    vehicleId: bestEta.vehicleId,
    stale: bestEta.stale,
    calculatedAt: bestEta.calculatedAt,
  };
}

async function getVehicleSpeedHistory(vehicleId: string): Promise<number[]> {
  const result = await sql`
    SELECT ls.inferred_speed
    FROM location_samples ls
    INNER JOIN boarding_sessions bs ON bs.id = ls.session_id
    WHERE bs.virtual_vehicle_id = ${vehicleId}
      AND ls.is_simulated = false
      AND ls.inferred_speed IS NOT NULL
    ORDER BY ls.timestamp DESC
    LIMIT 5
  `;

  return result
    .map((row) => Number(row.inferred_speed))
    .filter((speed) => Number.isFinite(speed) && speed >= 0)
    .reverse();
}

async function getStopCountForRoute(routeId: string): Promise<number> {
  const result = await sql`
    SELECT COUNT(*) as count
    FROM route_stops
    WHERE route_id = ${routeId}
  `;

  const count = Number(result[0]?.count ?? 0);
  // Return at least 5 stops as a minimum estimate
  return Math.max(5, count);
}

// ============================================================================
// Statistics
// ============================================================================

export async function getRouteStatistics(routeId: string): Promise<{
  avgSpeed: number;
  sampleCount: number;
  activePassengers: number;
}> {
  const result = await sql`
    SELECT
      AVG(inferred_speed) as avg_speed,
      COUNT(*) as sample_count
    FROM location_samples
    WHERE matched_route_id = ${routeId}
      AND created_at > NOW() - INTERVAL '1 hour'
  `;

  const sessions = await getActiveSessions(routeId);

  return {
    avgSpeed: Number(result[0]?.avg_speed) || 20,
    sampleCount: Number(result[0]?.sample_count) || 0,
    activePassengers: sessions.length,
  };
}
