// ============================================================================
// Morelia Conecta Backend Server
// Bun.serve with HTTP + WebSocket support
// ============================================================================

import { testConnection } from "./db/connection";
import { getSimulation } from "./simulation/engine";
import { getAllRoutes } from "./services/routes";
import { handleRequest } from "./routes/handler";
import { handleWebSocket, broadcastVehicleUpdate } from "./routes/websocket";
import type { Route } from "./types";

const PORT = parseInt(process.env.PORT || "3000");
const HOST = process.env.HOST || "0.0.0.0";
const MOBILITY_MODE = process.env.MOBILITY_MODE || "demo";

console.log(`
╔═══════════════════════════════════════════════════════════╗
║                    MORELIA CONECTA                        ║
║              Mobility as a Service Backend                ║
╚═══════════════════════════════════════════════════════════╝
`);

// ============================================================================
// Server Initialization
// ============================================================================

async function initializeServer() {
  console.log("Initializing server...");

  // Test database connection
  console.log("Testing database connection...");
  const dbConnected = await testConnection();

  if (!dbConnected) {
    console.warn("⚠️  Database not available - running in demo-only mode");
  } else {
    console.log("✓ Database connected");
  }

  // Initialize simulation engine
  if (MOBILITY_MODE === "demo") {
    console.log("Initializing simulation engine...");

    try {
      const simulation = getSimulation({
        seed: parseInt(process.env.SIMULATION_SEED || "42"),
        speedMultiplier: 1,
        vehiclesPerRoute: 2,
        gpsNoiseMeters: 8,
      });

      // Load routes from database if available
      if (dbConnected) {
        const routes = await getAllRoutes();
        if (routes.length > 0) {
          simulation.loadRoutes(routes);
          simulation.initializeVehicles();
          console.log(`✓ Loaded ${routes.length} routes into simulation`);
        } else {
          console.log("⚠️  No routes in database - run db:import-geojson");
        }
      }

      // Set up vehicle update broadcasting
      simulation.onVehicleUpdates((vehicles) => {
        broadcastVehicleUpdate(vehicles);
      });

      // Start simulation
      simulation.start();
      console.log("✓ Simulation engine started");
    } catch (error) {
      console.warn("⚠️  Simulation initialization failed:", error);
    }
  }

  console.log(`\nMode: ${MOBILITY_MODE.toUpperCase()}`);
  console.log(`Server ready on http://${HOST}:${PORT}\n`);
}

// ============================================================================
// Bun Server
// ============================================================================

const server = Bun.serve({
  port: PORT,
  hostname: HOST,

  async fetch(req, server) {
    const url = new URL(req.url);

    // Handle WebSocket upgrade
    if (url.pathname === "/ws/mobility") {
      const upgraded = server.upgrade(req, {
        data: { connectedAt: Date.now() },
      });
      if (upgraded) return undefined;
      return new Response("WebSocket upgrade failed", { status: 500 });
    }

    // Handle HTTP requests
    return handleRequest(req);
  },

  websocket: handleWebSocket,

  error(error) {
    console.error("Server error:", error);
    return new Response("Internal Server Error", { status: 500 });
  },
});

// Initialize
initializeServer().catch(console.error);

// Graceful shutdown
process.on("SIGINT", () => {
  console.log("\nShutting down...");
  getSimulation().stop();
  server.stop();
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.log("\nTerminating...");
  getSimulation().stop();
  server.stop();
  process.exit(0);
});

console.log(`Server starting on http://${HOST}:${PORT}...`);
