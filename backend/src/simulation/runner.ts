// ============================================================================
// Standalone Simulation Runner
// Runs simulation without full server for testing/debugging
// ============================================================================

import { getSimulation, resetSimulation } from "./engine";
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import type { Route, GeoJSONMultiLineString } from "../types";

const PROJECT_ROOT = resolve(dirname(import.meta.path), "../../..");
const ROUTES_FILE = resolve(PROJECT_ROOT, "mobile/assets/geojson/rutas_morelia.geojson");

// ANSI colors for console output
const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
};

function loadRoutes(): Route[] {
  console.log(`Loading routes from: ${ROUTES_FILE}`);

  if (!existsSync(ROUTES_FILE)) {
    console.error("Routes file not found!");
    process.exit(1);
  }

  const data = JSON.parse(readFileSync(ROUTES_FILE, "utf-8"));
  const routes: Route[] = [];

  for (const feature of data.features) {
    const props = feature.properties || {};
    const id = feature.id || props.ref || props.nombre;

    // Convert geometry
    let geometry: GeoJSONMultiLineString;
    if (feature.geometry.type === "LineString") {
      geometry = {
        type: "MultiLineString",
        coordinates: [feature.geometry.coordinates],
      };
    } else {
      geometry = feature.geometry;
    }

    // Calculate total length
    let totalLength = 0;
    for (const line of geometry.coordinates) {
      for (let i = 0; i < line.length - 1; i++) {
        const [lon1, lat1] = line[i];
        const [lon2, lat2] = line[i + 1];
        totalLength += haversine(lat1, lon1, lat2, lon2);
      }
    }

    routes.push({
      id,
      ref: props.ref || id,
      name: props.nombre || id,
      mode: "Combi",
      color: "#C94C28",
      osmId: props.osmid || null,
      variantes: props.variantes || 1,
      paradasCount: 0,
      sinNombre: props.sin_nombre || false,
      fuente: "osm-demo",
      geometry,
      totalLengthM: totalLength,
      createdAt: new Date(),
    });
  }

  return routes;
}

function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function main() {
  console.log(`
${colors.bright}${colors.cyan}╔═══════════════════════════════════════════════════════════╗
║              SIMULATION RUNNER                            ║
║              Morelia Conecta Demo Mode                    ║
╚═══════════════════════════════════════════════════════════╝${colors.reset}
`);

  // Load routes
  const routes = loadRoutes();
  console.log(`${colors.green}✓${colors.reset} Loaded ${routes.length} routes\n`);

  // Initialize simulation
  const seed = parseInt(process.argv[2] || "42");
  const speedMultiplier = parseInt(process.argv[3] || "1") as 1 | 5 | 10;

  console.log(`Configuration:`);
  console.log(`  Seed: ${seed}`);
  console.log(`  Speed: ${speedMultiplier}x`);
  console.log();

  const simulation = getSimulation({
    seed,
    speedMultiplier,
    vehiclesPerRoute: 2,
    gpsNoiseMeters: 8,
    dropSampleProbability: 0.05,
  });

  simulation.loadRoutes(routes);
  simulation.initializeVehicles();

  console.log(`${colors.green}✓${colors.reset} Simulation initialized\n`);

  // Track updates
  let updateCount = 0;
  let lastPrintTime = Date.now();

  simulation.onVehicleUpdates((vehicles) => {
    updateCount++;

    // Print status every 5 seconds
    if (Date.now() - lastPrintTime > 5000) {
      console.log(`${colors.bright}[Tick ${updateCount}]${colors.reset}`);

      // Show first 5 vehicles
      for (const v of vehicles.slice(0, 5)) {
        const progressBar = createProgressBar(v.progress, 20);
        console.log(
          `  ${colors.cyan}${v.routeId.padEnd(15)}${colors.reset} ` +
            `${progressBar} ` +
            `${(v.speed).toFixed(1)} km/h ` +
            `${colors.yellow}${v.passengerCount} pax${colors.reset} ` +
            `[${v.confidence}]`
        );
      }

      if (vehicles.length > 5) {
        console.log(`  ... and ${vehicles.length - 5} more vehicles`);
      }

      console.log();
      lastPrintTime = Date.now();
    }
  });

  simulation.onLocationSamples((sample) => {
    // Optional: log GPS samples
    // console.log(`GPS: ${sample.sessionId} @ (${sample.lat.toFixed(5)}, ${sample.lon.toFixed(5)})`);
  });

  // Start simulation
  console.log(`${colors.green}▶${colors.reset} Simulation running. Press Ctrl+C to stop.\n`);
  simulation.start();

  // Handle shutdown
  process.on("SIGINT", () => {
    console.log(`\n${colors.yellow}Stopping simulation...${colors.reset}`);
    simulation.stop();

    console.log(`\nStats:`);
    console.log(`  Total updates: ${updateCount}`);

    const vehicles = simulation.getVirtualVehicles();
    const totalPassengers = vehicles.reduce((sum, v) => sum + v.passengerCount, 0);
    console.log(`  Active vehicles: ${vehicles.length}`);
    console.log(`  Total passengers: ${totalPassengers}`);

    process.exit(0);
  });
}

function createProgressBar(progress: number, width: number): string {
  const filled = Math.round(progress * width);
  const empty = width - filled;
  return `[${colors.green}${"█".repeat(filled)}${colors.reset}${"░".repeat(empty)}]`;
}

main().catch(console.error);
