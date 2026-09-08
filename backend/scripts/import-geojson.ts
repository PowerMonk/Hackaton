// ============================================================================
// GeoJSON Import Script
// Imports routes and stops from local GeoJSON files into PostGIS
// ============================================================================

import { sql, testConnection } from "../src/db/connection";
import { importRoutesFromGeoJSON, importStopsFromGeoJSON } from "../src/services/routes";
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";

const PROJECT_ROOT = resolve(dirname(import.meta.path), "../..");

const ROUTES_FILE = resolve(PROJECT_ROOT, "mobile/assets/geojson/rutas_morelia.geojson");
const STOPS_FILE = resolve(PROJECT_ROOT, "mobile/assets/geojson/paradas_morelia.geojson");

// Alternative paths
const ALT_ROUTES_FILE = resolve(PROJECT_ROOT, "morelia-rutas/rutas.geojson");
const ALT_STOPS_FILE = resolve(PROJECT_ROOT, "morelia-rutas/paradas.geojson");

async function main() {
  console.log("GeoJSON Import Script");
  console.log("=====================\n");

  // Test database connection
  console.log("Connecting to database...");
  const connected = await testConnection();

  if (!connected) {
    console.error("❌ Failed to connect to database");
    console.error("Make sure PostgreSQL is running: docker compose up -d postgres");
    process.exit(1);
  }

  console.log("✓ Database connected\n");

  // Find routes file
  let routesPath = ROUTES_FILE;
  if (!existsSync(routesPath)) {
    routesPath = ALT_ROUTES_FILE;
  }
  if (!existsSync(routesPath)) {
    console.error("❌ Routes GeoJSON file not found");
    console.error(`  Checked: ${ROUTES_FILE}`);
    console.error(`  Checked: ${ALT_ROUTES_FILE}`);
    process.exit(1);
  }

  // Find stops file
  let stopsPath = STOPS_FILE;
  if (!existsSync(stopsPath)) {
    stopsPath = ALT_STOPS_FILE;
  }
  if (!existsSync(stopsPath)) {
    console.warn("⚠️  Stops GeoJSON file not found - skipping stops import");
    stopsPath = "";
  }

  // Import routes
  console.log(`Importing routes from: ${routesPath}`);
  try {
    const routesData = JSON.parse(readFileSync(routesPath, "utf-8"));
    console.log(`  Found ${routesData.features?.length || 0} route features`);

    const importedRoutes = await importRoutesFromGeoJSON(routesData);
    console.log(`✓ Imported ${importedRoutes} routes\n`);
  } catch (error) {
    console.error("❌ Failed to import routes:", error);
    process.exit(1);
  }

  // Import stops
  if (stopsPath) {
    console.log(`Importing stops from: ${stopsPath}`);
    try {
      const stopsData = JSON.parse(readFileSync(stopsPath, "utf-8"));
      console.log(`  Found ${stopsData.features?.length || 0} stop features`);

      const importedStops = await importStopsFromGeoJSON(stopsData);
      console.log(`✓ Imported ${importedStops} stops\n`);
    } catch (error) {
      console.error("❌ Failed to import stops:", error);
    }
  }

  // Link stops to routes (by proximity)
  console.log("Linking stops to nearby routes...");
  try {
    const result = await sql`
      INSERT INTO route_stops (route_id, stop_id, route_progress)
      SELECT DISTINCT ON (r.id, s.id)
        r.id as route_id,
        s.id as stop_id,
        calculate_route_progress(r.geometry, s.location) as route_progress
      FROM routes r
      CROSS JOIN stops s
      WHERE ST_DWithin(r.geometry::geography, s.location::geography, 100)
      ON CONFLICT (route_id, stop_id) DO UPDATE SET
        route_progress = EXCLUDED.route_progress
    `;
    console.log(`✓ Linked stops to routes\n`);
  } catch (error) {
    console.warn("⚠️  Failed to link stops:", error);
  }

  // Update route paradas_count
  console.log("Updating route stop counts...");
  try {
    await sql`
      UPDATE routes r
      SET paradas_count = (
        SELECT COUNT(*) FROM route_stops rs WHERE rs.route_id = r.id
      )
    `;
    console.log("✓ Updated stop counts\n");
  } catch (error) {
    console.warn("⚠️  Failed to update counts:", error);
  }

  // Summary
  const routeCount = await sql`SELECT COUNT(*) as count FROM routes`;
  const stopCount = await sql`SELECT COUNT(*) as count FROM stops`;
  const linkCount = await sql`SELECT COUNT(*) as count FROM route_stops`;

  console.log("Import Summary");
  console.log("--------------");
  console.log(`Routes: ${routeCount[0].count}`);
  console.log(`Stops: ${stopCount[0].count}`);
  console.log(`Route-Stop Links: ${linkCount[0].count}`);

  console.log("\n✓ Import complete!");
  process.exit(0);
}

main().catch((error) => {
  console.error("Import failed:", error);
  process.exit(1);
});
