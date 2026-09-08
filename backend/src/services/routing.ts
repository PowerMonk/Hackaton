// ============================================================================
// Street Routing Service
// Uses OSRM for walking/cycling routes with mock fallback
// ============================================================================

import type {
  RoutePlanRequest,
  RoutePlanResult,
  RouteLeg,
  Coordinates,
  GeoJSONLineString,
} from "../types";
import { getAllRoutes, getStopsNearPoint } from "./routes";

interface OsrmResponse {
  code?: string;
  routes?: Array<{
    distance: number;
    duration: number;
    geometry: GeoJSONLineString;
  }>;
}

const OSRM_BASE_URL = process.env.OSRM_BASE_URL || "https://router.project-osrm.org";

// Walking speed estimate: 5 km/h
const WALKING_SPEED_MS = 5 / 3.6;

// Transit average speed: 20 km/h (Morelia urban)
const TRANSIT_SPEED_MS = 20 / 3.6;

export async function planRoute(request: RoutePlanRequest): Promise<RoutePlanResult> {
  const { origin, destination, priority, modes } = request;

  // Calculate direct walking distance
  const directDistance = haversineDistance(
    origin.lat,
    origin.lon,
    destination.lat,
    destination.lon
  );

  // If very short distance or walking only, just return walking leg
  if (directDistance < 500 || (modes.length === 1 && modes[0] === "walk")) {
    const walkingRoute = await getWalkingRoute(
      { lat: origin.lat, lon: origin.lon },
      { lat: destination.lat, lon: destination.lon }
    );
    return walkingRoute;
  }

  // Build multimodal route if transit is allowed
  if (modes.includes("transit")) {
    return await buildTransitRoute(origin, destination, priority);
  }

  // Cycling or walking only
  if (modes.includes("bicycle")) {
    return await getBicycleRoute(
      { lat: origin.lat, lon: origin.lon },
      { lat: destination.lat, lon: destination.lon }
    );
  }

  // Default to walking
  return await getWalkingRoute(
    { lat: origin.lat, lon: origin.lon },
    { lat: destination.lat, lon: destination.lon }
  );
}

// ============================================================================
// Transit Route Building
// ============================================================================

async function buildTransitRoute(
  origin: { label: string; lat: number; lon: number },
  destination: { label: string; lat: number; lon: number },
  priority: string
): Promise<RoutePlanResult> {
  // Find stops near origin and destination
  const originStops = await getStopsNearPoint(origin.lat, origin.lon, 500);
  const destStops = await getStopsNearPoint(destination.lat, destination.lon, 500);

  if (originStops.length === 0 || destStops.length === 0) {
    // No transit available, fall back to walking
    return await getWalkingRoute(
      { lat: origin.lat, lon: origin.lon },
      { lat: destination.lat, lon: destination.lon }
    );
  }

  // For MVP, use first matching stop pair
  const originStop = originStops[0];
  const destStop = destStops[0];

  // Find routes that serve both stops
  const routes = await getAllRoutes();
  const connectingRoute = routes.find(
    (r) =>
      originStop.routeIds.includes(r.id) && destStop.routeIds.includes(r.id)
  );

  const legs: RouteLeg[] = [];
  let totalDistance = 0;
  let totalDuration = 0;
  let totalWalking = 0;

  // Leg 1: Walk to origin stop
  const walkToStop = haversineDistance(
    origin.lat,
    origin.lon,
    originStop.coordinates.lat,
    originStop.coordinates.lon
  );
  totalDistance += walkToStop;
  totalWalking += walkToStop;
  const walkToStopDuration = walkToStop / WALKING_SPEED_MS;
  totalDuration += walkToStopDuration;

  legs.push({
    mode: "walk",
    from: { lat: origin.lat, lon: origin.lon, label: origin.label },
    to: {
      lat: originStop.coordinates.lat,
      lon: originStop.coordinates.lon,
      label: originStop.name || "Parada",
    },
    distanceMeters: Math.round(walkToStop),
    durationSeconds: Math.round(walkToStopDuration),
    instructions: `Camina hacia ${originStop.name || "la parada"}`,
  });

  // Leg 2: Transit
  const transitDistance = haversineDistance(
    originStop.coordinates.lat,
    originStop.coordinates.lon,
    destStop.coordinates.lat,
    destStop.coordinates.lon
  );
  totalDistance += transitDistance;
  const transitDuration = transitDistance / TRANSIT_SPEED_MS;
  totalDuration += transitDuration;

  legs.push({
    mode: "transit",
    from: {
      lat: originStop.coordinates.lat,
      lon: originStop.coordinates.lon,
      label: originStop.name || "Parada",
    },
    to: {
      lat: destStop.coordinates.lat,
      lon: destStop.coordinates.lon,
      label: destStop.name || "Parada",
    },
    distanceMeters: Math.round(transitDistance),
    durationSeconds: Math.round(transitDuration),
    routeId: connectingRoute?.id,
    routeName: connectingRoute?.name,
    routeColor: connectingRoute?.color,
    instructions: connectingRoute
      ? `Toma ${connectingRoute.name}`
      : "Transporte público",
  });

  // Leg 3: Walk from destination stop
  const walkFromStop = haversineDistance(
    destStop.coordinates.lat,
    destStop.coordinates.lon,
    destination.lat,
    destination.lon
  );
  totalDistance += walkFromStop;
  totalWalking += walkFromStop;
  const walkFromStopDuration = walkFromStop / WALKING_SPEED_MS;
  totalDuration += walkFromStopDuration;

  legs.push({
    mode: "walk",
    from: {
      lat: destStop.coordinates.lat,
      lon: destStop.coordinates.lon,
      label: destStop.name || "Parada",
    },
    to: { lat: destination.lat, lon: destination.lon, label: destination.label },
    distanceMeters: Math.round(walkFromStop),
    durationSeconds: Math.round(walkFromStopDuration),
    instructions: `Camina hacia ${destination.label}`,
  });

  return {
    legs,
    totalDistanceMeters: Math.round(totalDistance),
    totalDurationSeconds: Math.round(totalDuration),
    totalWalkingMeters: Math.round(totalWalking),
    transfers: 0,
    estimatedCost: 12, // Base fare for Morelia transit
    provider: "mock",
  };
}

// ============================================================================
// OSRM Integration
// ============================================================================

async function getWalkingRoute(
  from: Coordinates,
  to: Coordinates
): Promise<RoutePlanResult> {
  try {
    const route = await osrmRoute(from, to, "foot");
    if (route) {
      return {
        legs: [
          {
            mode: "walk",
            from: { ...from },
            to: { ...to },
            distanceMeters: route.distance,
            durationSeconds: route.duration,
            geometry: route.geometry,
          },
        ],
        totalDistanceMeters: route.distance,
        totalDurationSeconds: route.duration,
        totalWalkingMeters: route.distance,
        transfers: 0,
        provider: "osrm",
      };
    }
  } catch (error) {
    console.warn("OSRM walking route failed:", error);
  }

  // Fallback to straight-line estimate
  return straightLineRoute(from, to, "walk");
}

async function getBicycleRoute(
  from: Coordinates,
  to: Coordinates
): Promise<RoutePlanResult> {
  try {
    const route = await osrmRoute(from, to, "bike");
    if (route) {
      return {
        legs: [
          {
            mode: "bicycle",
            from: { ...from },
            to: { ...to },
            distanceMeters: route.distance,
            durationSeconds: route.duration,
            geometry: route.geometry,
          },
        ],
        totalDistanceMeters: route.distance,
        totalDurationSeconds: route.duration,
        totalWalkingMeters: 0,
        transfers: 0,
        provider: "osrm",
      };
    }
  } catch (error) {
    console.warn("OSRM bicycle route failed:", error);
  }

  // Fallback
  return straightLineRoute(from, to, "bicycle");
}

async function osrmRoute(
  from: Coordinates,
  to: Coordinates,
  profile: "foot" | "bike" | "driving" = "foot"
): Promise<{
  distance: number;
  duration: number;
  geometry: GeoJSONLineString;
} | null> {
  const coords = `${from.lon},${from.lat};${to.lon},${to.lat}`;
  const url = `${OSRM_BASE_URL}/route/v1/${profile}/${coords}?overview=full&geometries=geojson`;

  const response = await fetch(url, {
    headers: { "User-Agent": "MoreliaConecta/1.0" },
  });

  if (!response.ok) {
    throw new Error(`OSRM error: ${response.status}`);
  }

  const data = (await response.json()) as OsrmResponse;

  if (data.code !== "Ok" || !data.routes || data.routes.length === 0) {
    return null;
  }

  const route = data.routes[0];
  return {
    distance: route.distance,
    duration: route.duration,
    geometry: route.geometry,
  };
}

// ============================================================================
// Fallback Calculations
// ============================================================================

function straightLineRoute(
  from: Coordinates,
  to: Coordinates,
  mode: "walk" | "bicycle"
): RoutePlanResult {
  const distance = haversineDistance(from.lat, from.lon, to.lat, to.lon);

  // Walking: 5 km/h, Bicycle: 15 km/h
  const speed = mode === "walk" ? 5 / 3.6 : 15 / 3.6;
  const duration = distance / speed;

  return {
    legs: [
      {
        mode,
        from: { ...from },
        to: { ...to },
        distanceMeters: Math.round(distance),
        durationSeconds: Math.round(duration),
      },
    ],
    totalDistanceMeters: Math.round(distance),
    totalDurationSeconds: Math.round(duration),
    totalWalkingMeters: mode === "walk" ? Math.round(distance) : 0,
    transfers: 0,
    provider: "mock",
  };
}

function haversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}
