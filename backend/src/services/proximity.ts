// ============================================================================
// Proximity Detection Service
// Detects when user is near stops and when they've likely boarded a vehicle
// ============================================================================

import { sql } from "../db/connection";
import type { Coordinates, MobilityState } from "../types";

// ============================================================================
// Types
// ============================================================================

export interface NearbyStop {
  id: string;
  name: string | null;
  distanceMeters: number;
  routeIds: string[];
}

export interface ProximityEvent {
  type: "near_stop" | "at_stop" | "boarding_likely" | "on_vehicle" | "alighting_likely";
  stopId?: string;
  stopName?: string;
  routeId?: string;
  confidence: "Alta" | "Media" | "Baja";
  message: string;
  timestamp: Date;
}

export interface BoardingState {
  isNearStop: boolean;
  isOnVehicle: boolean;
  nearbyStops: NearbyStop[];
  currentRouteId: string | null;
  routeProgress: number | null;
  lastStopId: string | null;
  boardedAt: Date | null;
  events: ProximityEvent[];
}

export interface ProximityConfig {
  /** Distance to consider "near" a stop (meters) */
  nearStopRadius: number;
  /** Distance to consider "at" a stop (meters) */
  atStopRadius: number;
  /** Minimum speed to consider user is on a moving vehicle (km/h) */
  minVehicleSpeed: number;
  /** Maximum distance from route to consider on-vehicle (meters) */
  maxRouteDistance: number;
  /** Minimum samples on route to confirm boarding */
  minSamplesForBoarding: number;
  /** Time window for recent samples (seconds) */
  recentSampleWindow: number;
}

export const DEFAULT_PROXIMITY_CONFIG: ProximityConfig = {
  nearStopRadius: 100,
  atStopRadius: 30,
  minVehicleSpeed: 8,
  maxRouteDistance: 50,
  minSamplesForBoarding: 3,
  recentSampleWindow: 120,
};

// ============================================================================
// Stop Proximity Detection
// ============================================================================

/**
 * Find stops near a given location.
 */
export async function findNearbyStops(
  location: Coordinates,
  radiusMeters: number = DEFAULT_PROXIMITY_CONFIG.nearStopRadius
): Promise<NearbyStop[]> {
  const result = await sql`
    SELECT
      s.id,
      s.name,
      ST_Distance(
        s.location::geography,
        ST_SetSRID(ST_MakePoint(${location.lon}, ${location.lat}), 4326)::geography
      ) as distance_m,
      COALESCE(
        array_agg(DISTINCT rs.route_id) FILTER (WHERE rs.route_id IS NOT NULL),
        ARRAY[]::text[]
      ) as route_ids
    FROM stops s
    LEFT JOIN route_stops rs ON rs.stop_id = s.id
    WHERE ST_DWithin(
      s.location::geography,
      ST_SetSRID(ST_MakePoint(${location.lon}, ${location.lat}), 4326)::geography,
      ${radiusMeters}
    )
    GROUP BY s.id, s.name, s.location
    ORDER BY distance_m
    LIMIT 5
  `;

  return result.map((row) => ({
    id: row.id,
    name: row.name,
    distanceMeters: Number(row.distance_m),
    routeIds: row.route_ids || [],
  }));
}

/**
 * Check if user is at or near a stop.
 */
export async function checkStopProximity(
  location: Coordinates,
  config: ProximityConfig = DEFAULT_PROXIMITY_CONFIG
): Promise<{
  isNearStop: boolean;
  isAtStop: boolean;
  nearbyStops: NearbyStop[];
  closestStop: NearbyStop | null;
}> {
  const nearbyStops = await findNearbyStops(location, config.nearStopRadius);

  const closestStop = nearbyStops[0] ?? null;
  const isAtStop = closestStop !== null && closestStop.distanceMeters <= config.atStopRadius;
  const isNearStop = nearbyStops.length > 0;

  return {
    isNearStop,
    isAtStop,
    nearbyStops,
    closestStop,
  };
}

// ============================================================================
// Boarding Detection
// ============================================================================

interface RecentSample {
  matchedRouteId: string | null;
  routeProgress: number | null;
  distanceFromRoute: number | null;
  inferredSpeed: number | null;
  mobilityState: MobilityState;
  timestamp: Date;
}

/**
 * Get recent location samples for a session.
 */
async function getRecentSamples(
  sessionId: string,
  windowSeconds: number
): Promise<RecentSample[]> {
  const result = await sql`
    SELECT
      matched_route_id,
      route_progress,
      distance_from_route,
      inferred_speed,
      mobility_state,
      created_at
    FROM location_samples
    WHERE session_id = ${sessionId}
      AND created_at > NOW() - INTERVAL '${windowSeconds} seconds'
    ORDER BY created_at DESC
    LIMIT 20
  `;

  return result.map((row) => ({
    matchedRouteId: row.matched_route_id,
    routeProgress: row.route_progress !== null ? Number(row.route_progress) : null,
    distanceFromRoute: row.distance_from_route !== null ? Number(row.distance_from_route) : null,
    inferredSpeed: row.inferred_speed !== null ? Number(row.inferred_speed) : null,
    mobilityState: row.mobility_state as MobilityState,
    timestamp: row.created_at,
  }));
}

/**
 * Analyze samples to detect if user has boarded a vehicle.
 */
export async function detectBoardingState(
  sessionId: string,
  currentLocation: Coordinates,
  currentSpeed: number | null,
  matchedRouteId: string | null,
  routeProgress: number | null,
  distanceFromRoute: number | null,
  config: ProximityConfig = DEFAULT_PROXIMITY_CONFIG
): Promise<BoardingState> {
  const events: ProximityEvent[] = [];
  const now = new Date();

  // Check stop proximity
  const stopProximity = await checkStopProximity(currentLocation, config);

  // Get recent samples for pattern analysis
  const recentSamples = await getRecentSamples(sessionId, config.recentSampleWindow);

  // Count samples on route
  const samplesOnRoute = recentSamples.filter(
    (s) => s.matchedRouteId !== null &&
           s.distanceFromRoute !== null &&
           s.distanceFromRoute <= config.maxRouteDistance
  );

  // Count moving samples
  const movingSamples = recentSamples.filter(
    (s) => s.inferredSpeed !== null && s.inferredSpeed >= config.minVehicleSpeed
  );

  // Determine boarding state
  const isOnRoute = matchedRouteId !== null &&
                    distanceFromRoute !== null &&
                    distanceFromRoute <= config.maxRouteDistance;

  const isMoving = currentSpeed !== null && currentSpeed >= config.minVehicleSpeed;

  const hasConsistentRoute = samplesOnRoute.length >= config.minSamplesForBoarding &&
    samplesOnRoute.every((s) => s.matchedRouteId === matchedRouteId);

  const isOnVehicle = isOnRoute && isMoving && hasConsistentRoute;

  // Generate events
  if (stopProximity.isAtStop && stopProximity.closestStop) {
    events.push({
      type: "at_stop",
      stopId: stopProximity.closestStop.id,
      stopName: stopProximity.closestStop.name ?? undefined,
      confidence: "Alta",
      message: `Estás en ${stopProximity.closestStop.name || "la parada"}`,
      timestamp: now,
    });
  } else if (stopProximity.isNearStop && stopProximity.closestStop) {
    events.push({
      type: "near_stop",
      stopId: stopProximity.closestStop.id,
      stopName: stopProximity.closestStop.name ?? undefined,
      confidence: "Media",
      message: `Cerca de ${stopProximity.closestStop.name || "una parada"} (${Math.round(stopProximity.closestStop.distanceMeters)}m)`,
      timestamp: now,
    });
  }

  if (isOnVehicle) {
    events.push({
      type: "on_vehicle",
      routeId: matchedRouteId ?? undefined,
      confidence: hasConsistentRoute ? "Alta" : "Media",
      message: "Parece que estás en un vehículo",
      timestamp: now,
    });
  } else if (isOnRoute && !isMoving && samplesOnRoute.length >= 2) {
    // On route but not moving - might be boarding
    events.push({
      type: "boarding_likely",
      routeId: matchedRouteId ?? undefined,
      confidence: "Media",
      message: "¿Ya subiste al transporte?",
      timestamp: now,
    });
  }

  // Detect potential alighting (was moving, now stopped near a stop)
  const wasMoving = movingSamples.length >= 2;
  if (wasMoving && !isMoving && stopProximity.isNearStop) {
    events.push({
      type: "alighting_likely",
      stopId: stopProximity.closestStop?.id,
      stopName: stopProximity.closestStop?.name ?? undefined,
      confidence: "Media",
      message: "¿Ya llegaste a tu destino?",
      timestamp: now,
    });
  }

  // Get last stop from session
  const lastStopResult = await sql`
    SELECT last_stop_id FROM boarding_sessions
    WHERE id = ${sessionId}
  `;
  const lastStopId = lastStopResult[0]?.last_stop_id ?? null;

  // Get boarding time from session
  const sessionResult = await sql`
    SELECT started_at, current_state FROM boarding_sessions
    WHERE id = ${sessionId}
  `;
  const boardedAt = sessionResult[0]?.current_state === "IN_TRANSIT"
    ? sessionResult[0]?.started_at
    : null;

  return {
    isNearStop: stopProximity.isNearStop,
    isOnVehicle,
    nearbyStops: stopProximity.nearbyStops,
    currentRouteId: matchedRouteId,
    routeProgress,
    lastStopId,
    boardedAt,
    events,
  };
}

// ============================================================================
// Session State Updates
// ============================================================================

/**
 * Update session with proximity/boarding state.
 */
export async function updateSessionBoardingState(
  sessionId: string,
  state: BoardingState
): Promise<void> {
  // Determine the new mobility state
  let newState: MobilityState = "UNKNOWN";
  if (state.isOnVehicle) {
    newState = "IN_TRANSIT";
  } else if (state.isNearStop) {
    newState = "WAITING";
  } else if (state.events.some(e => e.type === "alighting_likely")) {
    newState = "WALKING";
  }

  // Update nearest stop if at one
  const atStopEvent = state.events.find(e => e.type === "at_stop");
  const nearStopId = atStopEvent?.stopId ?? null;

  await sql`
    UPDATE boarding_sessions
    SET
      current_state = ${newState}::mobility_state,
      current_progress = COALESCE(${state.routeProgress}, current_progress),
      last_stop_id = COALESCE(${nearStopId}, last_stop_id)
    WHERE id = ${sessionId} AND ended_at IS NULL
  `;
}

// ============================================================================
// Progress Inference
// ============================================================================

/**
 * Estimate user's position along a route based on recent samples.
 */
export async function inferRouteProgress(
  sessionId: string,
  routeId: string
): Promise<{
  progress: number;
  confidence: "Alta" | "Media" | "Baja";
  estimatedPosition: Coordinates | null;
}> {
  // Get recent samples on this route
  const samples = await sql`
    SELECT
      route_progress,
      ST_Y(location::geometry) as lat,
      ST_X(location::geometry) as lon,
      created_at
    FROM location_samples
    WHERE session_id = ${sessionId}
      AND matched_route_id = ${routeId}
      AND route_progress IS NOT NULL
    ORDER BY created_at DESC
    LIMIT 10
  `;

  if (samples.length === 0) {
    return { progress: 0, confidence: "Baja", estimatedPosition: null };
  }

  // Use weighted average of recent progress values (more recent = higher weight)
  let totalWeight = 0;
  let weightedProgress = 0;

  for (let i = 0; i < samples.length; i++) {
    const weight = 1 / (i + 1); // Weight decreases with age
    weightedProgress += Number(samples[i].route_progress) * weight;
    totalWeight += weight;
  }

  const progress = weightedProgress / totalWeight;
  const confidence = samples.length >= 5 ? "Alta" : samples.length >= 3 ? "Media" : "Baja";

  // Get estimated position from most recent sample
  const latest = samples[0];
  const estimatedPosition = latest
    ? { lat: Number(latest.lat), lon: Number(latest.lon) }
    : null;

  return { progress, confidence, estimatedPosition };
}

// ============================================================================
// Notifications
// ============================================================================

export interface ProximityNotification {
  id: string;
  type: "boarding_prompt" | "destination_alert" | "stop_approaching" | "transfer_reminder";
  title: string;
  body: string;
  priority: "high" | "normal" | "low";
  data: Record<string, unknown>;
}

/**
 * Generate notifications based on boarding state.
 */
export function generateNotifications(
  state: BoardingState,
  sessionRouteId: string | null,
  destinationStopId: string | null
): ProximityNotification[] {
  const notifications: ProximityNotification[] = [];

  // Boarding prompt when near stop but not yet on vehicle
  const boardingEvent = state.events.find(e => e.type === "boarding_likely");
  if (boardingEvent) {
    notifications.push({
      id: `boarding-${Date.now()}`,
      type: "boarding_prompt",
      title: "¿Ya subiste?",
      body: boardingEvent.message,
      priority: "high",
      data: { routeId: boardingEvent.routeId },
    });
  }

  // Destination approaching alert
  if (destinationStopId && state.nearbyStops.some(s => s.id === destinationStopId)) {
    const destStop = state.nearbyStops.find(s => s.id === destinationStopId);
    notifications.push({
      id: `destination-${Date.now()}`,
      type: "destination_alert",
      title: "¡Llegando a tu destino!",
      body: `${destStop?.name || "Tu parada"} está cerca (${Math.round(destStop?.distanceMeters || 0)}m)`,
      priority: "high",
      data: { stopId: destinationStopId },
    });
  }

  // Alighting prompt
  const alightingEvent = state.events.find(e => e.type === "alighting_likely");
  if (alightingEvent) {
    notifications.push({
      id: `alighting-${Date.now()}`,
      type: "destination_alert",
      title: "¿Ya llegaste?",
      body: alightingEvent.message,
      priority: "normal",
      data: { stopId: alightingEvent.stopId },
    });
  }

  return notifications;
}
