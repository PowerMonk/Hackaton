// ============================================================================
// Improved Transit Routing Service
// Finds optimal transit connections with transfers
// ============================================================================

import type {
  RoutePlanRequest,
  RoutePlanResult,
  RouteLeg,
  Coordinates,
  GeoJSONLineString,
} from "../types";
import { getAllRoutes, getStopsNearPoint } from "./routes";
import type { Route, Stop } from "../types";

interface OsrmResponse {
  code?: string;
  routes?: Array<{
    distance: number;
    duration: number;
    geometry: GeoJSONLineString;
  }>;
}

const OSRM_BASE_URL = process.env.OSRM_BASE_URL || "https://router.project-osrm.org";

// Walking speed: 5 km/h
const WALKING_SPEED_MS = 5 / 3.6;

// Transit average speed: 20 km/h (Morelia urban)
const TRANSIT_SPEED_MS = 20 / 3.6;

// Maximum walking distance to/from stops: 1km
const MAX_WALKING_TO_STOP = 1000;

// Maximum walking distance for entire trip before preferring transit
const MAX_REASONABLE_WALKING = 2000;

// Transfer penalty (seconds) - discourages unnecessary transfers
const TRANSFER_PENALTY = 300; // 5 minutes

// Wait time at stops (seconds)
const WAIT_TIME_PER_STOP = 180; // 3 minutes average wait

interface TransitPlan {
  legs: RouteLeg[];
  totalDistance: number;
  totalDuration: number;
  totalWalking: number;
  transfers: number;
  cost: number;
}

export async function planRoute(request: RoutePlanRequest): Promise<RoutePlanResult> {
  const { origin, destination, priority, modes } = request;

  // Calculate direct walking distance
  const directDistance = haversineDistance(
    origin.lat,
    origin.lon,
    destination.lat,
    destination.lon
  );

  // For very short distances (< 800m), walking is usually best
  if (directDistance < 800 && modes.includes("walk")) {
    const walkingRoute = await getWalkingRoute(
      { lat: origin.lat, lon: origin.lon },
      { lat: destination.lat, lon: destination.lon }
    );
    return walkingRoute;
  }

  // If walking only mode
  if (modes.length === 1 && modes[0] === "walk") {
    return await getWalkingRoute(
      { lat: origin.lat, lon: origin.lon },
      { lat: destination.lat, lon: destination.lon }
    );
  }

  // If bicycle mode
  if (modes.includes("bicycle") && !modes.includes("transit")) {
    return await getBicycleRoute(
      { lat: origin.lat, lon: origin.lon },
      { lat: destination.lat, lon: destination.lon }
    );
  }

  // Build multimodal route with transit
  if (modes.includes("transit")) {
    const transitPlan = await buildOptimalTransitRoute(origin, destination, priority);

    // Compare with walking if distance is reasonable
    if (directDistance < MAX_REASONABLE_WALKING) {
      const walkingRoute = await getWalkingRoute(
        { lat: origin.lat, lon: origin.lon },
        { lat: destination.lat, lon: destination.lon }
      );

      // Prefer transit if it's significantly faster (at least 25% time savings)
      if (transitPlan.totalDuration < walkingRoute.totalDurationSeconds * 0.75) {
        return transitPlanToResult(transitPlan);
      }

      // If transit is only slightly faster, prefer it for longer distances
      if (directDistance > 1500 && transitPlan.totalDuration < walkingRoute.totalDurationSeconds * 1.1) {
        return transitPlanToResult(transitPlan);
      }

      // Otherwise return walking
      return walkingRoute;
    }

    return transitPlanToResult(transitPlan);
  }

  // Default to walking
  return await getWalkingRoute(
    { lat: origin.lat, lon: origin.lon },
    { lat: destination.lat, lon: destination.lon }
  );
}

// ============================================================================
// Optimal Transit Route Building
// ============================================================================

async function buildOptimalTransitRoute(
  origin: { label: string; lat: number; lon: number },
  destination: { label: string; lat: number; lon: number },
  priority: string
): Promise<TransitPlan> {
  // Find stops near origin and destination with larger radius
  const originStops = await getStopsNearPoint(origin.lat, origin.lon, MAX_WALKING_TO_STOP);
  const destStops = await getStopsNearPoint(destination.lat, destination.lon, MAX_WALKING_TO_STOP);

  if (originStops.length === 0 || destStops.length === 0) {
    // No transit available, return walking as fallback
    const walkingRoute = await getWalkingRoute(
      { lat: origin.lat, lon: origin.lon },
      { lat: destination.lat, lon: destination.lon }
    );
    return routeResultToTransitPlan(walkingRoute);
  }

  const routes = await getAllRoutes();

  // Try to find direct connections first (no transfers)
  const directPlans = await findDirectConnections(
    origin,
    destination,
    originStops,
    destStops,
    routes
  );

  // Try to find connections with one transfer
  const transferPlans = await findOneTransferConnections(
    origin,
    destination,
    originStops,
    destStops,
    routes
  );

  // Combine and sort all plans
  const allPlans = [...directPlans, ...transferPlans];

  if (allPlans.length === 0) {
    // No transit connections found, fallback to walking
    const walkingRoute = await getWalkingRoute(
      { lat: origin.lat, lon: origin.lon },
      { lat: destination.lat, lon: destination.lon }
    );
    return routeResultToTransitPlan(walkingRoute);
  }

  // Score and sort plans based on priority
  const scoredPlans = allPlans.map(plan => ({
    plan,
    score: scorePlan(plan, priority),
  }));

  scoredPlans.sort((a, b) => b.score - a.score);

  return scoredPlans[0].plan;
}

// ============================================================================
// Connection Finding
// ============================================================================

async function findDirectConnections(
  origin: { label: string; lat: number; lon: number },
  destination: { label: string; lat: number; lon: number },
  originStops: Stop[],
  destStops: Stop[],
  routes: Route[]
): Promise<TransitPlan[]> {
  const plans: TransitPlan[] = [];

  for (const originStop of originStops) {
    for (const destStop of destStops) {
      // Find routes that serve both stops
      const connectingRoutes = routes.filter(
        (r) =>
          originStop.routeIds.includes(r.id) && destStop.routeIds.includes(r.id)
      );

      for (const route of connectingRoutes) {
        const plan = buildDirectTransitPlan(
          origin,
          destination,
          originStop,
          destStop,
          route
        );
        plans.push(plan);
      }
    }
  }

  return plans;
}

async function findOneTransferConnections(
  origin: { label: string; lat: number; lon: number },
  destination: { label: string; lat: number; lon: number },
  originStops: Stop[],
  destStops: Stop[],
  routes: Route[]
): Promise<TransitPlan[]> {
  const plans: TransitPlan[] = [];

  // Find all possible transfer points
  for (const originStop of originStops) {
    for (const destStop of destStops) {
      // Get routes from origin
      const originRoutes = routes.filter(r => originStop.routeIds.includes(r.id));

      // Get routes to destination
      const destRoutes = routes.filter(r => destStop.routeIds.includes(r.id));

      // Find common stops between origin routes and destination routes
      for (const originRoute of originRoutes) {
        for (const destRoute of destRoutes) {
          if (originRoute.id === destRoute.id) continue; // Skip same route

          // Find potential transfer stops (stops served by both routes)
          const transferStopIds = originRoute.geometry.coordinates[0]
            .map((_, idx) => `transfer-${idx}`) // Simplified - in production, use actual stop matching
            .slice(0, 5); // Limit to reasonable number of transfer points

          // For each potential transfer point, build a plan
          // In a real implementation, we'd find actual stops served by both routes
          // For now, we'll create a simplified transfer plan
          const midPoint = {
            lat: (originStop.coordinates.lat + destStop.coordinates.lat) / 2,
            lon: (originStop.coordinates.lon + destStop.coordinates.lon) / 2,
          };

          const transferStop: Stop = {
            id: 'transfer-point',
            name: 'Punto de transbordo',
            coordinates: midPoint,
            routeIds: [originRoute.id, destRoute.id],
            createdAt: new Date(),
          };

          const plan = buildTransferTransitPlan(
            origin,
            destination,
            originStop,
            transferStop,
            destStop,
            originRoute,
            destRoute
          );

          // Only add if total walking distance is reasonable
          if (plan.totalWalking < MAX_WALKING_TO_STOP * 2.5) {
            plans.push(plan);
          }
        }
      }
    }
  }

  return plans;
}

// ============================================================================
// Plan Building
// ============================================================================

function buildDirectTransitPlan(
  origin: { label: string; lat: number; lon: number },
  destination: { label: string; lat: number; lon: number },
  originStop: Stop,
  destStop: Stop,
  route: Route
): TransitPlan {
  const legs: RouteLeg[] = [];
  let totalDistance = 0;
  let totalDuration = 0;
  let totalWalking = 0;

  // Walk to origin stop
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
    instructions: `Camina ${Math.round(walkToStop)}m hacia ${originStop.name || "la parada"}`,
  });

  // Wait time
  totalDuration += WAIT_TIME_PER_STOP;

  // Transit leg
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
    routeId: route.id,
    routeName: route.name,
    routeColor: route.color,
    instructions: `Toma ${route.name}`,
  });

  // Walk from destination stop
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
    instructions: `Camina ${Math.round(walkFromStop)}m hacia ${destination.label}`,
  });

  return {
    legs,
    totalDistance: Math.round(totalDistance),
    totalDuration: Math.round(totalDuration),
    totalWalking: Math.round(totalWalking),
    transfers: 0,
    cost: 12,
  };
}

function buildTransferTransitPlan(
  origin: { label: string; lat: number; lon: number },
  destination: { label: string; lat: number; lon: number },
  originStop: Stop,
  transferStop: Stop,
  destStop: Stop,
  firstRoute: Route,
  secondRoute: Route
): TransitPlan {
  const legs: RouteLeg[] = [];
  let totalDistance = 0;
  let totalDuration = 0;
  let totalWalking = 0;

  // Walk to origin stop
  const walkToStop = haversineDistance(
    origin.lat,
    origin.lon,
    originStop.coordinates.lat,
    originStop.coordinates.lon
  );
  totalDistance += walkToStop;
  totalWalking += walkToStop;
  const walkToStopDuration = walkToStop / WALKING_SPEED_MS;
  totalDuration += walkToStopDuration + WAIT_TIME_PER_STOP;

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
    instructions: `Camina ${Math.round(walkToStop)}m hacia ${originStop.name || "la parada"}`,
  });

  // First transit leg
  const firstTransitDistance = haversineDistance(
    originStop.coordinates.lat,
    originStop.coordinates.lon,
    transferStop.coordinates.lat,
    transferStop.coordinates.lon
  );
  totalDistance += firstTransitDistance;
  const firstTransitDuration = firstTransitDistance / TRANSIT_SPEED_MS;
  totalDuration += firstTransitDuration;

  legs.push({
    mode: "transit",
    from: {
      lat: originStop.coordinates.lat,
      lon: originStop.coordinates.lon,
      label: originStop.name || "Parada",
    },
    to: {
      lat: transferStop.coordinates.lat,
      lon: transferStop.coordinates.lon,
      label: transferStop.name || "Transbordo",
    },
    distanceMeters: Math.round(firstTransitDistance),
    durationSeconds: Math.round(firstTransitDuration),
    routeId: firstRoute.id,
    routeName: firstRoute.name,
    routeColor: firstRoute.color,
    instructions: `Toma ${firstRoute.name}`,
  });

  // Transfer penalty + wait time
  totalDuration += TRANSFER_PENALTY + WAIT_TIME_PER_STOP;

  // Second transit leg
  const secondTransitDistance = haversineDistance(
    transferStop.coordinates.lat,
    transferStop.coordinates.lon,
    destStop.coordinates.lat,
    destStop.coordinates.lon
  );
  totalDistance += secondTransitDistance;
  const secondTransitDuration = secondTransitDistance / TRANSIT_SPEED_MS;
  totalDuration += secondTransitDuration;

  legs.push({
    mode: "transit",
    from: {
      lat: transferStop.coordinates.lat,
      lon: transferStop.coordinates.lon,
      label: transferStop.name || "Transbordo",
    },
    to: {
      lat: destStop.coordinates.lat,
      lon: destStop.coordinates.lon,
      label: destStop.name || "Parada",
    },
    distanceMeters: Math.round(secondTransitDistance),
    durationSeconds: Math.round(secondTransitDuration),
    routeId: secondRoute.id,
    routeName: secondRoute.name,
    routeColor: secondRoute.color,
    instructions: `Toma ${secondRoute.name}`,
  });

  // Walk from destination stop
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
    instructions: `Camina ${Math.round(walkFromStop)}m hacia ${destination.label}`,
  });

  return {
    legs,
    totalDistance: Math.round(totalDistance),
    totalDuration: Math.round(totalDuration),
    totalWalking: Math.round(totalWalking),
    transfers: 1,
    cost: 24, // Two fares
  };
}

// ============================================================================
// Plan Scoring
// ============================================================================

function scorePlan(plan: TransitPlan, priority: string): number {
  let score = 0;

  switch (priority) {
    case "fastest":
      // Lower duration is better
      score = 10000 - plan.totalDuration;
      // Penalize transfers
      score -= plan.transfers * 500;
      break;

    case "least_walking":
      // Lower walking distance is better
      score = 10000 - plan.totalWalking;
      // Still consider duration
      score -= plan.totalDuration * 0.1;
      break;

    case "fewest_transfers":
      // Fewer transfers is better
      score = 1000 - plan.transfers * 1000;
      // Consider duration as secondary
      score -= plan.totalDuration * 0.1;
      break;

    case "cheapest":
      // Lower cost is better
      score = 100 - plan.cost;
      // Consider duration as secondary
      score -= plan.totalDuration * 0.05;
      break;

    default:
      score = 10000 - plan.totalDuration;
  }

  return score;
}

// ============================================================================
// Helper Functions
// ============================================================================

function transitPlanToResult(plan: TransitPlan): RoutePlanResult {
  return {
    legs: plan.legs,
    totalDistanceMeters: plan.totalDistance,
    totalDurationSeconds: plan.totalDuration,
    totalWalkingMeters: plan.totalWalking,
    transfers: plan.transfers,
    estimatedCost: plan.cost,
    provider: "mock",
  };
}

function routeResultToTransitPlan(result: RoutePlanResult): TransitPlan {
  return {
    legs: result.legs,
    totalDistance: result.totalDistanceMeters,
    totalDuration: result.totalDurationSeconds,
    totalWalking: result.totalWalkingMeters,
    transfers: result.transfers || 0,
    cost: result.estimatedCost || 0,
  };
}

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

function straightLineRoute(
  from: Coordinates,
  to: Coordinates,
  mode: "walk" | "bicycle"
): RoutePlanResult {
  const distance = haversineDistance(from.lat, from.lon, to.lat, to.lon);
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
