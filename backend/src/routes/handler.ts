// ============================================================================
// HTTP Request Handler
// Routes all incoming HTTP requests to appropriate handlers
// ============================================================================

import {
  getAllRoutes,
  getRouteById,
  getRouteWithVehicles,
  getAllStops,
  getStopById,
} from "../services/routes";
import {
  createBoardingSession,
  endSession,
  getActiveSessions,
  processLocationSample,
  getVirtualVehicles,
  calculateStopEta,
  getRouteStatistics,
} from "../services/mobility";
import { autocomplete, reverseGeocode } from "../services/geocoding";
import { planRoute } from "../services/routing";
import {
  planProvisionalRoutes,
  type PlannerDataset,
  type PlannerMode,
  type PlannerRequest,
} from "../services/planner";
import { getSimulation } from "../simulation/engine";
import { parseLocationSample } from "../services/location-validation";
import type { LocationSample, RoutePlanRequest } from "../types";

interface ServerState {
  dbConnected: boolean;
  schemaReady: boolean;
  routeCount: number;
  stopCount: number;
  simulationRunning: boolean;
}

// CORS headers for Flutter app
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

// JSON response helper
function json(data: unknown, status: number = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...CORS_HEADERS,
    },
  });
}

// Error response helper
function error(message: string, status: number = 400): Response {
  return json({ error: message }, status);
}

// ============================================================================
// Main Request Handler
// ============================================================================

export async function handleRequest(
  req: Request,
  serverState: ServerState
): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname;
  const method = req.method;

  // Handle CORS preflight
  if (method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  try {
    // ========================================================================
    // Health check
    // ========================================================================
    if (path === "/health" && method === "GET") {
      return json({
        status: serverState.dbConnected && serverState.schemaReady ? "healthy" : "degraded",
        mode: process.env.MOBILITY_MODE || "demo",
        database: {
          connected: serverState.dbConnected,
          schemaReady: serverState.schemaReady,
          routes: serverState.routeCount,
          stops: serverState.stopCount,
        },
        simulation: {
          running: serverState.simulationRunning,
        },
        timestamp: new Date().toISOString(),
        version: "0.2.0",
      });
    }

    // ========================================================================
    // Routes
    // ========================================================================

    if (path === "/routes" && method === "GET") {
      if (!serverState.dbConnected) {
        // Return simulation-only routes
        const simulation = getSimulation();
        const vehicles = simulation.getVirtualVehicles();
        const routeIds = [...new Set(vehicles.map((v) => v.routeId))];
        return json({
          routes: routeIds.map((id) => ({ id, name: id, mode: "Combi" })),
          count: routeIds.length,
          source: "simulation",
        });
      }

      const routes = await getAllRoutes();
      return json({ routes, count: routes.length, source: "database" });
    }

    if (path.match(/^\/routes\/[^/]+$/) && method === "GET") {
      const routeId = decodeURIComponent(path.split("/")[2]);

      if (!serverState.dbConnected) {
        return json({ id: routeId, name: routeId, source: "simulation" });
      }

      const route = await getRouteById(routeId);
      if (!route) return error("Route not found", 404);
      return json(route);
    }

    if (path.match(/^\/routes\/[^/]+\/vehicles$/) && method === "GET") {
      const routeId = decodeURIComponent(path.split("/")[2]);

      const vehicles = await getVirtualVehicles(routeId);

      return json({
        routeId,
        vehicles,
        count: vehicles.length,
        activePassengers: vehicles.reduce((sum, v) => sum + v.passengerCount, 0),
      });
    }

    // ========================================================================
    // Stops
    // ========================================================================

    if (path === "/stops" && method === "GET") {
      if (!serverState.dbConnected) {
        return json({ stops: [], count: 0, source: "unavailable" });
      }

      const stops = await getAllStops();
      return json({ stops, count: stops.length });
    }

    if (path.match(/^\/stops\/[^/]+$/) && method === "GET") {
      const stopId = decodeURIComponent(path.split("/")[2]);

      if (!serverState.dbConnected) {
        return error("Database not available", 503);
      }

      const stop = await getStopById(stopId);
      if (!stop) return error("Stop not found", 404);
      return json(stop);
    }

    if (path.match(/^\/stops\/[^/]+\/eta$/) && method === "GET") {
      const stopId = decodeURIComponent(path.split("/")[2]);
      const routeId = url.searchParams.get("routeId") || undefined;

      if (!serverState.dbConnected) {
        // Return simulation-based ETA
        return json({
          stopId,
          eta: {
            minMinutes: 5,
            maxMinutes: 10,
            label: "5-10 min",
            confidence: "Baja",
            stale: true,
          },
          source: "simulation",
        });
      }

      const eta = await calculateStopEta(stopId, routeId);
      return json({ stopId, eta });
    }

    // ========================================================================
    // Boarding Sessions
    // ========================================================================

    if (path === "/boarding-sessions" && method === "POST") {
      const body = await req.json() as Record<string, unknown>;
      const routeId = body.routeId as string | undefined;
      const deviceId = body.deviceId as string | undefined;
      const isSimulated =
        typeof body.isSimulated === "boolean"
          ? body.isSimulated
          : (process.env.MOBILITY_MODE || "demo") === "demo";

      if (!routeId || !deviceId) {
        return error("routeId and deviceId are required", 422);
      }

      if (!serverState.dbConnected) {
        // Return mock session
        return json({
          id: `sim-session-${Date.now()}`,
          routeId,
          deviceId,
          startedAt: new Date().toISOString(),
          isSimulated: true,
        }, 201);
      }

      const session = await createBoardingSession(
        routeId,
        deviceId,
        isSimulated
      );

      return json(session, 201);
    }

    if (path.match(/^\/boarding-sessions\/[^/]+$/) && method === "DELETE") {
      const sessionId = decodeURIComponent(path.split("/")[2]);

      if (!serverState.dbConnected) {
        return json({ success: true, sessionId });
      }

      const ended = await endSession(sessionId);
      if (!ended) return error("Session not found or already ended", 404);
      return json({ success: true, sessionId });
    }

    if (path === "/boarding-sessions" && method === "GET") {
      if (!serverState.dbConnected) {
        return json({ sessions: [], count: 0 });
      }

      const routeId = url.searchParams.get("routeId") || undefined;
      const sessions = await getActiveSessions(routeId);
      return json({ sessions, count: sessions.length });
    }

    // ========================================================================
    // Location Samples
    // ========================================================================

    if (path === "/locations" && method === "POST") {
      let body: unknown;
      try {
        body = await req.json();
      } catch {
        return error("Request body must be valid JSON", 400);
      }

      const validation = parseLocationSample(body);
      if (!validation.valid) {
        return error(validation.errors.join("; "), 422);
      }

      const sample: LocationSample = validation.sample;
      if (!serverState.dbConnected) {
        return error(
          "Location sample could not be persisted because the database is unavailable",
          503
        );
      }

      const processed = await processLocationSample(sample);
      if (!processed.persisted) {
        return error("Session not found or already ended", 409);
      }

      return json(processed, 201);
    }

    // ========================================================================
    // Route Planning
    // ========================================================================

    if (path === "/route-plans" && method === "POST") {
      const body = await req.json() as Record<string, unknown>;

      const request: RoutePlanRequest = {
        origin: body.origin as RoutePlanRequest["origin"],
        destination: body.destination as RoutePlanRequest["destination"],
        priority: (body.priority as RoutePlanRequest["priority"]) || "fastest",
        modes: (body.modes as RoutePlanRequest["modes"]) || ["walk", "transit"],
      };

      if (!request.origin || !request.destination) {
        return error("origin and destination are required", 422);
      }

      const plan = await planRouteWithAdapter(
        request,
        serverState.dbConnected && serverState.schemaReady
      );
      return json(plan);
    }

    // ========================================================================
    // Geocoding
    // ========================================================================

    if (path === "/geocoding/autocomplete" && method === "GET") {
      const query = url.searchParams.get("q") || "";
      const limit = parseInt(url.searchParams.get("limit") || "5");

      if (!query || query.length < 2) {
        return json({ suggestions: [] });
      }

      const suggestions = await autocomplete(query, limit);
      return json({ suggestions });
    }

    if (path === "/geocoding/reverse" && method === "GET") {
      const lat = parseFloat(url.searchParams.get("lat") || "");
      const lon = parseFloat(url.searchParams.get("lon") || "");

      if (isNaN(lat) || isNaN(lon)) {
        return error("lat and lon are required", 422);
      }

      const result = await reverseGeocode(lat, lon);
      return json({ result });
    }

    // ========================================================================
    // Vehicles (from simulation)
    // ========================================================================

    if (path === "/vehicles" && method === "GET") {
      const routeId = url.searchParams.get("routeId") || undefined;
      const vehicles = await getVirtualVehicles(routeId);
      return json({ vehicles, count: vehicles.length });
    }

    // ========================================================================
    // Dashboard
    // ========================================================================

    if (path === "/dashboard/overview" && method === "GET") {
      const vehicles = await getVirtualVehicles();

      const overview = {
        totalRoutes: serverState.routeCount,
        activeRoutes: new Set(vehicles.map((v) => v.routeId)).size,
        totalStops: serverState.stopCount,
        activeVehicles: vehicles.length,
        totalPassengers: vehicles.reduce((sum, v) => sum + v.passengerCount, 0),
        avgSpeed:
          vehicles.length > 0
            ? Math.round(vehicles.reduce((sum, v) => sum + v.speed, 0) / vehicles.length)
            : 0,
        database: serverState.dbConnected ? "connected" : "offline",
        simulation: serverState.simulationRunning ? "running" : "stopped",
        systemHealth: serverState.dbConnected ? "healthy" : "degraded",
        lastUpdateAt: new Date().toISOString(),
      };

      return json(overview);
    }

    if (path === "/dashboard/vehicles" && method === "GET") {
      const vehicles = await getVirtualVehicles();

      const dashboardVehicles = vehicles.map((v) => ({
        vehicleId: v.id,
        routeId: v.routeId,
        progress: v.progress,
        speed: v.speed,
        passengerCount: v.passengerCount,
        position: v.currentPosition,
        confidence: v.confidence,
        lastUpdate: v.lastUpdateAt,
      }));

      return json({ vehicles: dashboardVehicles, count: dashboardVehicles.length });
    }

    // ========================================================================
    // Simulation Control
    // ========================================================================

    if (path === "/simulation/status" && method === "GET") {
      const simulation = getSimulation();
      const vehicles = simulation.getVirtualVehicles();

      return json({
        running: serverState.simulationRunning,
        vehicleCount: vehicles.length,
        totalPassengers: vehicles.reduce((sum, v) => sum + v.passengerCount, 0),
        mode: process.env.MOBILITY_MODE || "demo",
      });
    }

    if (path === "/simulation/reset" && method === "POST") {
      const simulation = getSimulation();
      simulation.reset();

      // Reload routes if available
      if (serverState.dbConnected && serverState.routeCount > 0) {
        const routes = await getAllRoutes();
        simulation.loadRoutes(routes);
        simulation.initializeVehicles();
        simulation.start();
      }

      return json({ success: true, message: "Simulation reset" });
    }

    // ========================================================================
    // 404 Not Found
    // ========================================================================

    return error(`Not found: ${method} ${path}`, 404);
  } catch (err) {
    console.error("Request error:", err);
    const message = err instanceof Error ? err.message : "Internal server error";
    return error(message, 500);
  }
}

async function planRouteWithAdapter(
  request: RoutePlanRequest,
  dbConnected: boolean
): Promise<unknown> {
  // The pure planner does not model bicycles. Keep the existing routing
  // behavior for that explicit mode instead of silently dropping it.
  if (request.modes.includes("bicycle")) {
    return planRoute(request);
  }

  try {
    const dataset = dbConnected
      ? await loadPlannerDataset()
      : emptyPlannerDataset();
    const plannerRequest: PlannerRequest = {
      origin: request.origin,
      destination: request.destination,
      priority: request.priority,
      modes: request.modes.filter(
        (mode): mode is PlannerMode => mode === "walk" || mode === "transit"
      ),
    };
    const result = planProvisionalRoutes(plannerRequest, dataset);
    const recommended = result.recommended;

    if (!recommended) {
      return planRoute(request);
    }

    // Preserve the legacy top-level response while exposing the richer
    // provisional alternatives and assumptions for new clients.
    return {
      legs: [...recommended.legs],
      totalDistanceMeters: recommended.totalDistanceMeters,
      totalDurationSeconds: recommended.totalDurationSeconds,
      totalWalkingMeters: recommended.totalWalkingMeters,
      transfers: recommended.transfers,
      estimatedCost: recommended.estimatedCost,
      provider: "mock" as const,
      recommended,
      plans: [...result.plans],
      alternatives: [...result.alternatives],
      metadata: result.metadata,
    };
  } catch (error) {
    console.warn("Provisional planner adapter failed; using routing fallback:", error);
    return planRoute(request);
  }
}

async function loadPlannerDataset(): Promise<PlannerDataset> {
  const [routes, stops] = await Promise.all([getAllRoutes(), getAllStops()]);
  return {
    routes: routes.map((route) => ({
      id: route.id,
      name: route.name,
      ref: route.ref,
      mode: route.mode,
      color: route.color,
    })),
    stops: stops.map((stop) => ({
      id: stop.id,
      name: stop.name,
      coordinates: stop.coordinates,
      routeIds: stop.routeIds,
    })),
    coverage: {
      source: "osm-demo",
      knownStops: stops.length,
      complete: false,
    },
  };
}

function emptyPlannerDataset(): PlannerDataset {
  return {
    routes: [],
    stops: [],
    coverage: { source: "offline", knownStops: 0, complete: false },
  };
}
