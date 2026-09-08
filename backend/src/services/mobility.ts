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
): Promise<ProcessedSample> {
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
  const speedKmh = sample.speed ? sample.speed * 3.6 : null;

  // Insert sample
  try {
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
        ${sample.heading || null},
        ${matchedRouteId},
        ${routeProgress},
        ${distanceFromRoute},
        ${speedKmh},
        ${mobilityState}::mobility_state,
        ${sample.isSimulated}
      )
    `;
  } catch (error) {
    console.error("Failed to insert location sample:", error);
  }

  // Update session
  if (matchedRouteId && routeProgress !== null) {
    try {
      await sql`
        UPDATE boarding_sessions
        SET
          current_state = ${mobilityState}::mobility_state,
          current_progress = ${routeProgress},
          current_speed = COALESCE(${speedKmh}, current_speed),
          last_sample_at = NOW()
        WHERE id = ${sample.sessionId}
      `;
    } catch (error) {
      console.error("Failed to update session:", error);
    }
  }

  return {
    ...sample,
    matchedRouteId,
    routeProgress,
    distanceFromRoute,
    inferredSpeed: speedKmh,
    mobilityState,
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
  const simulation = getSimulation();

  if (routeId) {
    return simulation.getRouteVehicles(routeId);
  }

  return simulation.getVirtualVehicles();
}

export async function syncVehiclesToDatabase(vehicles: VirtualVehicle[]): Promise<void> {
  for (const vehicle of vehicles) {
    try {
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
    } catch (error) {
      // Ignore individual vehicle sync errors
    }
  }
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

  // Find route and progress at stop
  let routeMatch;
  if (routeId) {
    routeMatch = await sql`
      SELECT
        r.id as route_id,
        calculate_route_progress(r.geometry, ST_SetSRID(ST_MakePoint(${stop.lon}, ${stop.lat}), 4326)) as progress
      FROM routes r
      WHERE r.id = ${routeId}
      LIMIT 1
    `;
  } else {
    routeMatch = await sql`
      SELECT route_id, progress
      FROM routes_near_point(${stop.lat}, ${stop.lon}, 200)
      LIMIT 1
    `;
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

  // Get vehicles approaching this stop
  const vehicles = await getVirtualVehicles(matchedRouteId);
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
