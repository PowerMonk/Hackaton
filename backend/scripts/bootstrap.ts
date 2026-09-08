// ============================================================================
// Bootstrap Script
// Runs migrations and imports data if needed
// ============================================================================

import { sql, testConnection, checkSchema } from "../src/db/connection";
import {
  importRoutesFromGeoJSON,
  importStopsFromGeoJSON,
  linkStopsToRoutes,
  getRouteCount,
  getStopCount,
} from "../src/services/routes";
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";

const PROJECT_ROOT = resolve(dirname(import.meta.path), "../..");

// Possible GeoJSON locations
const GEOJSON_PATHS = [
  resolve(PROJECT_ROOT, "data/geojson"),
  resolve(PROJECT_ROOT, "mobile/assets/geojson"),
  resolve(PROJECT_ROOT, "morelia-rutas"),
];

async function findGeoJSON(): Promise<{ routes: string | null; stops: string | null }> {
  for (const basePath of GEOJSON_PATHS) {
    const routesPath = resolve(basePath, "rutas_morelia.geojson");
    const altRoutesPath = resolve(basePath, "rutas.geojson");

    if (existsSync(routesPath)) {
      const stopsPath = resolve(basePath, "paradas_morelia.geojson");
      const altStopsPath = resolve(basePath, "paradas.geojson");

      return {
        routes: routesPath,
        stops: existsSync(stopsPath) ? stopsPath : existsSync(altStopsPath) ? altStopsPath : null,
      };
    }

    if (existsSync(altRoutesPath)) {
      const stopsPath = resolve(basePath, "paradas.geojson");
      return {
        routes: altRoutesPath,
        stops: existsSync(stopsPath) ? stopsPath : null,
      };
    }
  }

  return { routes: null, stops: null };
}

async function runMigrations(): Promise<boolean> {
  console.log("Running migrations...");

  const migrationsDir = resolve(dirname(import.meta.path), "../db/init");

  try {
    // Read and execute migration files
    const files = [
      "001_extensions.sql",
      "002_schema.sql",
      "003_integrity_indexes.sql",
    ];

    for (const file of files) {
      const filePath = resolve(migrationsDir, file);
      if (!existsSync(filePath)) {
        console.log(`  Skipping ${file} (not found)`);
        continue;
      }

      const content = readFileSync(filePath, "utf-8");

      // Execute SQL (handle multiple statements)
      try {
        await sql.unsafe(content);
        console.log(`  ✓ ${file}`);
      } catch (error: any) {
        if (error.message?.includes("already exists")) {
          console.log(`  ⚠ ${file} (already applied)`);
        } else {
          console.error(`  ✗ ${file}:`, error.message);
          return false;
        }
      }
    }

    return true;
  } catch (error) {
    console.error("Migration error:", error);
    return false;
  }
}

async function main() {
  console.log("\n=== Bootstrap ===\n");

  // Test connection
  const connected = await testConnection();
  if (!connected) {
    console.log("Database not available, skipping bootstrap");
    process.exit(0);
  }

  // Run migrations
  const migrationsOk = await runMigrations();
  if (!migrationsOk) {
    console.log("Migrations failed");
    process.exit(1);
  }

  // Check if data already exists
  const routeCount = await getRouteCount();
  const stopCount = await getStopCount();

  console.log(`\nCurrent data: ${routeCount} routes, ${stopCount} stops`);

  if (routeCount > 0) {
    console.log("Data already imported, skipping import");
    process.exit(0);
  }

  // Find GeoJSON files
  const { routes: routesPath, stops: stopsPath } = await findGeoJSON();

  if (!routesPath) {
    console.log("No GeoJSON files found, skipping import");
    process.exit(0);
  }

  // Import routes
  console.log(`\nImporting routes from: ${routesPath}`);
  try {
    const routesData = JSON.parse(readFileSync(routesPath, "utf-8"));
    const imported = await importRoutesFromGeoJSON(routesData);
    console.log(`  ✓ Imported ${imported} routes`);
  } catch (error) {
    console.error("  ✗ Route import failed:", error);
  }

  // Import stops
  if (stopsPath) {
    console.log(`Importing stops from: ${stopsPath}`);
    try {
      const stopsData = JSON.parse(readFileSync(stopsPath, "utf-8"));
      const imported = await importStopsFromGeoJSON(stopsData);
      console.log(`  ✓ Imported ${imported} stops`);
    } catch (error) {
      console.error("  ✗ Stop import failed:", error);
    }

    // Link stops to routes
    console.log("Linking stops to routes...");
    try {
      const linked = await linkStopsToRoutes();
      console.log(`  ✓ Created ${linked} route-stop links`);
    } catch (error) {
      console.error("  ✗ Linking failed:", error);
    }
  }

  // Final counts
  const finalRoutes = await getRouteCount();
  const finalStops = await getStopCount();

  console.log(`\n=== Bootstrap Complete ===`);
  console.log(`Routes: ${finalRoutes}`);
  console.log(`Stops: ${finalStops}\n`);

  process.exit(0);
}

main().catch((error) => {
  console.error("Bootstrap failed:", error);
  process.exit(1);
});
