// ============================================================================
// Morelia Conecta Backend Server
// Bun.serve with HTTP + WebSocket support
// ============================================================================

import { testConnection, checkSchema, getTableCounts } from "./db/connection";
import { getSimulation } from "./simulation/engine";
import { getAllRoutes, getRouteCount, getStopCount } from "./services/routes";
import { processLocationSample, syncVehiclesToDatabase } from "./services/mobility";
import { handleRequest } from "./routes/handler";
import { handleWebSocket, broadcastVehicleUpdate } from "./routes/websocket";

const PORT = parseInt(process.env.PORT || "3000");
const HOST = process.env.HOST || "0.0.0.0";
const MOBILITY_MODE = process.env.MOBILITY_MODE || "demo";
const MAX_CONCURRENT_SIMULATION_SAMPLES = 4;
const VEHICLE_SYNC_INTERVAL_MS = 15_000;

console.log(`
╔═══════════════════════════════════════════════════════════╗
║                    MORELIA CONECTA                        ║
║              Mobility as a Service Backend                ║
╚═══════════════════════════════════════════════════════════╝
`);

// ============================================================================
// Server State
// ============================================================================

interface ServerState {
  dbConnected: boolean;
  schemaReady: boolean;
  routeCount: number;
  stopCount: number;
  simulationRunning: boolean;
}

export const serverState: ServerState = {
  dbConnected: false,
  schemaReady: false,
  routeCount: 0,
  stopCount: 0,
  simulationRunning: false,
};

// ============================================================================
// Server Initialization
// ============================================================================

async function initializeServer() {
  console.log("Initializing server...\n");

  // Test database connection
  console.log("1. Testing database connection...");
  serverState.dbConnected = await testConnection();

  if (!serverState.dbConnected) {
    console.log("   ⚠️  Database not available - running in simulation-only mode");
  } else {
    console.log("   ✓ Database connected");

    // Check schema
    console.log("2. Checking database schema...");
    const schema = await checkSchema();
    serverState.schemaReady = schema.routes && schema.stops && schema.sessions && schema.vehicles;

    if (serverState.schemaReady) {
      console.log("   ✓ Schema ready");

      // Get counts
      const counts = await getTableCounts();
      serverState.routeCount = counts.routes;
      serverState.stopCount = counts.stops;
      console.log(`   ✓ Routes: ${counts.routes}, Stops: ${counts.stops}`);
    } else {
      console.log("   ⚠️  Schema incomplete - run migrations first");
      console.log(`      routes: ${schema.routes}, stops: ${schema.stops}`);
    }
  }

  // Initialize simulation engine
  if (MOBILITY_MODE === "demo") {
    console.log("3. Initializing simulation engine...");

    const simulation = getSimulation({
      seed: parseInt(process.env.SIMULATION_SEED || "42"),
      speedMultiplier: 1,
      vehiclesPerRoute: 2,
      gpsNoiseMeters: 8,
    });

    // Load routes if available
    if (serverState.dbConnected && serverState.routeCount > 0) {
      try {
        const routes = await getAllRoutes();
        simulation.loadRoutes(routes);
        simulation.initializeVehicles();
        console.log(`   ✓ Loaded ${routes.length} routes`);
      } catch (error) {
        console.log("   ⚠️  Failed to load routes from database");
      }
    } else {
      console.log("   ⚠️  No routes available for simulation");
    }

    // Limit persistence work so simulated samples cannot exhaust the DB pool.
    let samplesInFlight = 0;
    simulation.onLocationSamples((sample) => {
      if (!serverState.dbConnected || !serverState.schemaReady) return;
      if (samplesInFlight >= MAX_CONCURRENT_SIMULATION_SAMPLES) return;

      samplesInFlight++;
      void processLocationSample(sample)
        .catch((error) => {
          console.error("Simulation sample processing failed:", error);
        })
        .finally(() => {
          samplesInFlight--;
        });
    });

    // Broadcast vehicle updates via WebSocket
    let lastVehicleSyncAt = 0;
    simulation.onVehicleUpdates((vehicles) => {
      broadcastVehicleUpdate(vehicles);

      if (!serverState.dbConnected || !serverState.schemaReady) return;
      const now = Date.now();
      if (now - lastVehicleSyncAt < VEHICLE_SYNC_INTERVAL_MS) return;

      lastVehicleSyncAt = now;
      void syncVehiclesToDatabase(vehicles).catch((error) => {
        console.error("Vehicle synchronization failed:", error);
      });
    });

    // Start simulation
    simulation.start();
    serverState.simulationRunning = true;
    console.log("   ✓ Simulation started");
  }

  console.log(`
╔═══════════════════════════════════════════════════════════╗
║  Server ready at http://${HOST}:${PORT}
║  WebSocket at ws://${HOST}:${PORT}/ws/mobility
║  Mode: ${MOBILITY_MODE.toUpperCase()}
╚═══════════════════════════════════════════════════════════╝
`);
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
    return handleRequest(req, serverState);
  },

  websocket: handleWebSocket,

  error(error) {
    console.error("Server error:", error);
    return new Response("Internal Server Error", { status: 500 });
  },
});

// Initialize
initializeServer().catch((error) => {
  console.error("Initialization failed:", error);
});

// Graceful shutdown
process.on("SIGINT", () => {
  console.log("\nShutting down...");
  try {
    getSimulation().stop();
  } catch {}
  server.stop();
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.log("\nTerminating...");
  try {
    getSimulation().stop();
  } catch {}
  server.stop();
  process.exit(0);
});

console.log(`Server starting on http://${HOST}:${PORT}...`);
