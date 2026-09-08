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
import { getSimulation } from "../simulation/engine";
import type { LocationSample, RoutePlanRequest } from "../types";

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

export async function handleRequest(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname;
  const method = req.method;

  // Handle CORS preflight
  if (method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  try {
    // Health check
    if (path === "/health" && method === "GET") {
      return json({
        status: "healthy",
        mode: process.env.MOBILITY_MODE || "demo",
        timestamp: new Date().toISOString(),
        version: "0.1.0",
      });
    }

    // ========================================================================
    // Routes
    // ========================================================================

    if (path === "/routes" && method === "GET") {
      const routes = await getAllRoutes();
      return json({ routes, count: routes.length });
    }

    if (path.match(/^\/routes\/[^/]+$/) && method === "GET") {
      const routeId = path.split("/")[2];
      const route = await getRouteById(routeId);
      if (!route) return error("Route not found", 404);
      return json(route);
    }

    if (path.match(/^\/routes\/[^/]+\/vehicles$/) && method === "GET") {
      const routeId = path.split("/")[2];
      const routeWithVehicles = await getRouteWithVehicles(routeId);
      if (!routeWithVehicles) return error("Route not found", 404);
      return json({
        routeId,
        vehicles: routeWithVehicles.vehicles,
        activePassengers: routeWithVehicles.activePassengers,
      });
    }

    // ========================================================================
    // Stops
    // ========================================================================

    if (path === "/stops" && method === "GET") {
      const stops = await getAllStops();
      return json({ stops, count: stops.length });
    }

    if (path.match(/^\/stops\/[^/]+$/) && method === "GET") {
      const stopId = path.split("/")[2];
      const stop = await getStopById(stopId);
      if (!stop) return error("Stop not found", 404);
      return json(stop);
    }

    if (path.match(/^\/stops\/[^/]+\/eta$/) && method === "GET") {
      const stopId = path.split("/")[2];
      const routeId = url.searchParams.get("routeId") || undefined;
      const eta = await calculateStopEta(stopId, routeId);
      if (!eta) return json({ eta: null, message: "No ETA available" });
      return json({ stopId, eta });
    }

    // ========================================================================
    // Boarding Sessions
    // ========================================================================

    if (path === "/boarding-sessions" && method === "POST") {
      const body = await req.json();
      const { routeId, deviceId } = body;

      if (!routeId || !deviceId) {
        return error("routeId and deviceId are required");
      }

      const session = await createBoardingSession(
        routeId,
        deviceId,
        process.env.MOBILITY_MODE === "demo"
      );

      return json(session, 201);
    }

    if (path.match(/^\/boarding-sessions\/[^/]+$/) && method === "DELETE") {
      const sessionId = path.split("/")[2];
      const ended = await endSession(sessionId);
      if (!ended) return error("Session not found or already ended", 404);
      return json({ success: true, sessionId });
    }

    if (path === "/boarding-sessions" && method === "GET") {
      const routeId = url.searchParams.get("routeId") || undefined;
      const sessions = await getActiveSessions(routeId);
      return json({ sessions, count: sessions.length });
    }

    // ========================================================================
    // Location Samples
    // ========================================================================

    if (path === "/locations" && method === "POST") {
      const body = await req.json();
      const sample: LocationSample = {
        sessionId: body.sessionId,
        timestamp: body.timestamp || Date.now(),
        lat: body.lat,
        lon: body.lon,
        accuracy: body.accuracy || 10,
        speed: body.speed,
        heading: body.heading,
        isSimulated: body.isSimulated || false,
      };

      if (!sample.sessionId || !sample.lat || !sample.lon) {
        return error("sessionId, lat, and lon are required");
      }

      const processed = await processLocationSample(sample);
      return json(processed, 201);
    }

    // ========================================================================
    // Route Planning
    // ========================================================================

    if (path === "/route-plans" && method === "POST") {
      const body = await req.json();
      const request: RoutePlanRequest = {
        origin: body.origin,
        destination: body.destination,
        priority: body.priority || "fastest",
        modes: body.modes || ["walk", "transit"],
      };

      if (!request.origin || !request.destination) {
        return error("origin and destination are required");
      }

      const plan = await planRoute(request);
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
        return error("lat and lon are required");
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
      const routes = await getAllRoutes();
      const stops = await getAllStops();
      const vehicles = await getVirtualVehicles();
      const sessions = await getActiveSessions();

      const overview = {
        totalRoutes: routes.length,
        activeRoutes: new Set(vehicles.map((v) => v.routeId)).size,
        totalStops: stops.length,
        activeVehicles: vehicles.length,
        totalPassengers: vehicles.reduce((sum, v) => sum + v.passengerCount, 0),
        avgSpeed:
          vehicles.length > 0
            ? vehicles.reduce((sum, v) => sum + v.speed, 0) / vehicles.length
            : 0,
        activeSessions: sessions.length,
        systemHealth: "healthy",
        lastUpdateAt: new Date().toISOString(),
      };

      return json(overview);
    }

    if (path === "/dashboard/vehicles" && method === "GET") {
      const vehicles = await getVirtualVehicles();
      const routes = await getAllRoutes();
      const routeMap = new Map(routes.map((r) => [r.id, r]));

      const dashboardVehicles = vehicles.map((v) => ({
        vehicleId: v.id,
        routeId: v.routeId,
        routeName: routeMap.get(v.routeId)?.name || v.routeId,
        progress: v.progress,
        speed: v.speed,
        passengerCount: v.passengerCount,
        position: v.currentPosition,
        confidence: v.confidence,
        lastUpdate: v.lastUpdateAt,
      }));

      return json({ vehicles: dashboardVehicles });
    }

    if (path === "/dashboard/stops" && method === "GET") {
      const stops = await getAllStops();

      const dashboardStops = await Promise.all(
        stops.slice(0, 20).map(async (stop) => {
          const eta = await calculateStopEta(stop.id);
          return {
            stopId: stop.id,
            name: stop.name,
            position: stop.coordinates,
            waitingPassengers: 0, // Would come from real data
            nextArrival: eta,
            routeIds: stop.routeIds,
          };
        })
      );

      return json({ stops: dashboardStops });
    }

    if (path.match(/^\/dashboard\/routes\/[^/]+$/) && method === "GET") {
      const routeId = path.split("/")[3];
      const stats = await getRouteStatistics(routeId);
      return json({ routeId, ...stats });
    }

    // ========================================================================
    // Simulation Control (demo mode only)
    // ========================================================================

    if (path === "/simulation/status" && method === "GET") {
      const simulation = getSimulation();
      const vehicles = simulation.getVirtualVehicles();

      return json({
        running: true, // Would track actual state
        vehicleCount: vehicles.length,
        totalPassengers: vehicles.reduce((sum, v) => sum + v.passengerCount, 0),
      });
    }

    if (path === "/simulation/reset" && method === "POST") {
      const simulation = getSimulation();
      simulation.reset();
      return json({ success: true, message: "Simulation reset" });
    }

    // ========================================================================
    // 404 Not Found
    // ========================================================================

    return error(`Not found: ${method} ${path}`, 404);
  } catch (err) {
    console.error("Request error:", err);
    return error(
      err instanceof Error ? err.message : "Internal server error",
      500
    );
  }
}
