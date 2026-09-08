// ============================================================================
// Mobility Service
// Handles boarding sessions, location processing, and ETA calculation
// ============================================================================

import { db } from "../db/connection";
import type {
  BoardingSession,
  LocationSample,
  ProcessedSample,
  VirtualVehicle,
  EtaResult,
  MobilityState,
} from "../types";
import { getSimulation } from "../simulation/engine";

// ============================================================================
// Boarding Sessions
// ============================================================================

export async function createBoardingSession(
  routeId: string,
  deviceId: string,
  isSimulated: boolean = false
): Promise<BoardingSession> {
  const result = await db.query`
    INSERT INTO boarding_sessions (route_id, device_id, is_simulated)
    VALUES (${routeId}, ${deviceId}, ${isSimulated})
    RETURNING
      id, route_id, device_id, started_at, ended_at,
      current_state::text, current_progress, current_speed,
      last_sample_at, virtual_vehicle_id, is_simulated, created_at
  `;

  const row = result[0];
  return mapSession(row);
}

export async function getSession(sessionId: string): Promise<BoardingSession | null> {
  const result = await db.query`
    SELECT
      id, route_id, device_id, started_at, ended_at,
      current_state::text, current_progress, current_speed,
      last_sample_at, virtual_vehicle_id, is_simulated, created_at
    FROM boarding_sessions
    WHERE id = ${sessionId}
    LIMIT 1
  `;

  if (result.length === 0) return null;
  return mapSession(result[0]);
}

export async function endSession(sessionId: string): Promise<boolean> {
  const result = await db.query`
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
    result = await db.query`
      SELECT
        id, route_id, device_id, started_at, ended_at,
        current_state::text, current_progress, current_speed,
        last_sample_at, virtual_vehicle_id, is_simulated, created_at
      FROM boarding_sessions
      WHERE ended_at IS NULL AND route_id = ${routeId}
      ORDER BY started_at DESC
    `;
  } else {
    result = await db.query`
      SELECT
        id, route_id, device_id, started_at, ended_at,
        current_state::text, current_progress, current_speed,
        last_sample_at, virtual_vehicle_id, is_simulated, created_at
      FROM boarding_sessions
      WHERE ended_at IS NULL
      ORDER BY started_at DESC
    `;
  }

  return result.map(mapSession);
}

function mapSession(row: any): BoardingSession {
  return {
    id: row.id,
    routeId: row.route_id,
    deviceId: row.device_id,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    currentState: row.current_state as MobilityState,
    currentProgress: row.current_progress,
    currentSpeed: row.current_speed,
    lastSampleAt: row.last_sample_at,
    virtualVehicleId: row.virtual_vehicle_id,
    isSimulated: row.is_simulated,
  };
}

// ============================================================================
// Location Processing
// ============================================================================

export async function processLocationSample(
  sample: LocationSample
): Promise<ProcessedSample> {
  // Find matching route
  const routeMatch = await db.query`
    SELECT route_id, distance_meters, progress
    FROM routes_near_point(${sample.lat}, ${sample.lon}, 100)
    LIMIT 1
  `;

  let matchedRouteId: string | null = null;
  let routeProgress: number | null = null;
  let distanceFromRoute: number | null = null;

  if (routeMatch.length > 0) {
    matchedRouteId = routeMatch[0].route_id;
    routeProgress = routeMatch[0].progress;
    distanceFromRoute = routeMatch[0].distance_meters;
  }

  // Infer mobility state
  const mobilityState = inferMobilityState(sample, distanceFromRoute);

  // Insert sample
  await db.query`
    INSERT INTO location_samples (
      session_id, timestamp, location, accuracy, speed, heading,
      matched_route_id, route_progress, distance_from_route,
      inferred_speed, mobility_state, is_simulated
    ) VALUES (
      ${sample.sessionId},
      ${sample.timestamp},
      ST_SetSRID(ST_MakePoint(${sample.lon}, ${sample.lat}), 4326),
      ${sample.accuracy},
      ${sample.speed || null},
      ${sample.heading || null},
      ${matchedRouteId},
      ${routeProgress},
      ${distanceFromRoute},
      ${sample.speed || null},
      ${mobilityState}::mobility_state,
      ${sample.isSimulated}
    )
  `;

  // Update session
  if (matchedRouteId && routeProgress !== null) {
    await db.query`
      UPDATE boarding_sessions
      SET
        current_state = ${mobilityState}::mobility_state,
        current_progress = ${routeProgress},
        current_speed = COALESCE(${sample.speed}, current_speed),
        last_sample_at = NOW()
      WHERE id = ${sample.sessionId}
    `;
  }

  return {
    ...sample,
    matchedRouteId,
    routeProgress,
    distanceFromRoute,
    inferredSpeed: sample.speed || null,
    mobilityState,
  };
}

function inferMobilityState(
  sample: LocationSample,
  distanceFromRoute: number | null
): MobilityState {
  // Simple state inference based on speed and route proximity
  const speed = sample.speed || 0;

  if (distanceFromRoute === null || distanceFromRoute > 50) {
    if (speed < 2) return "IDLE";
    if (speed < 6) return "WALKING";
    return "UNKNOWN";
  }

  if (speed < 2) return "WAITING";
  if (speed >= 2 && speed <= 50) return "IN_TRANSIT";

  return "UNKNOWN";
}

// ============================================================================
// Virtual Vehicles
// ============================================================================

export async function getVirtualVehicles(routeId?: string): Promise<VirtualVehicle[]> {
  // In demo mode, use simulation engine
  const simulation = getSimulation();

  if (routeId) {
    return simulation.getRouteVehicles(routeId);
  }

  return simulation.getVirtualVehicles();
}

export async function getVehicleById(vehicleId: string): Promise<VirtualVehicle | null> {
  const vehicles = await getVirtualVehicles();
  return vehicles.find((v) => v.id === vehicleId) || null;
}

// ============================================================================
// ETA Calculation
// ============================================================================

export async function calculateStopEta(
  stopId: string,
  routeId?: string
): Promise<EtaResult | null> {
  // Get stop location and find progress on route
  const stopResult = await db.query`
    SELECT
      s.id,
      ST_X(s.location) as lon,
      ST_Y(s.location) as lat
    FROM stops s
    WHERE s.id = ${stopId}
    LIMIT 1
  `;

  if (stopResult.length === 0) return null;

  const stop = stopResult[0];

  // Find nearest route if not specified
  const routeMatch = await db.query`
    SELECT route_id, progress
    FROM routes_near_point(${stop.lat}, ${stop.lon}, 200)
    ${routeId ? db.query`WHERE route_id = ${routeId}` : db.query``}
    LIMIT 1
  `;

  if (routeMatch.length === 0) return null;

  const matchedRouteId = routeMatch[0].route_id;
  const stopProgress = routeMatch[0].progress;

  // Get vehicles on this route
  const vehicles = await getVirtualVehicles(matchedRouteId);

  // Find nearest approaching vehicle
  const approachingVehicles = vehicles
    .filter((v) => v.progress < stopProgress)
    .sort((a, b) => b.progress - a.progress);

  if (approachingVehicles.length === 0) {
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

  const nearestVehicle = approachingVehicles[0];
  const simulation = getSimulation();

  const eta = simulation.calculateEta(
    matchedRouteId,
    nearestVehicle.progress,
    stopProgress
  );

  if (!eta) {
    return {
      minMinutes: 5,
      maxMinutes: 15,
      label: "5-15 min",
      confidence: "Baja",
      vehicleId: nearestVehicle.id,
      stale: false,
      calculatedAt: new Date(),
    };
  }

  return {
    minMinutes: eta.minMinutes,
    maxMinutes: eta.maxMinutes,
    label: `${eta.minMinutes}-${eta.maxMinutes} min`,
    confidence: eta.confidence as "Alta" | "Media" | "Baja",
    vehicleId: nearestVehicle.id,
    stale: false,
    calculatedAt: new Date(),
  };
}

// ============================================================================
// Statistics
// ============================================================================

export async function getRouteStatistics(routeId: string): Promise<{
  avgSpeed: number;
  sampleCount: number;
  activePassengers: number;
}> {
  const result = await db.query`
    SELECT
      AVG(inferred_speed) as avg_speed,
      COUNT(*) as sample_count
    FROM location_samples
    WHERE matched_route_id = ${routeId}
      AND created_at > NOW() - INTERVAL '1 hour'
  `;

  const sessions = await getActiveSessions(routeId);

  return {
    avgSpeed: result[0]?.avg_speed || 20,
    sampleCount: result[0]?.sample_count || 0,
    activePassengers: sessions.length,
  };
}
