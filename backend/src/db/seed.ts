// ============================================================================
// Database Seeder
// Seeds initial demo data for testing
// ============================================================================

import { sql, testConnection } from "./connection";
import { getSimulation } from "../simulation/engine";
import { getAllRoutes } from "../services/routes";

async function main() {
  console.log("Database Seeder");
  console.log("===============\n");

  // Test connection
  console.log("Connecting to database...");
  const connected = await testConnection();

  if (!connected) {
    console.error("❌ Failed to connect to database");
    process.exit(1);
  }

  console.log("✓ Database connected\n");

  // Check if we have routes
  const routes = await getAllRoutes();
  if (routes.length === 0) {
    console.log("⚠️  No routes found. Run 'bun run db:import-geojson' first.");
    process.exit(1);
  }

  console.log(`Found ${routes.length} routes\n`);

  // Create some demo boarding sessions
  console.log("Creating demo boarding sessions...");

  const selectedRoutes = routes.slice(0, 5);

  for (const route of selectedRoutes) {
    const deviceId = `demo-device-${route.id.replace(/\s/g, "-")}`;

    try {
      await sql`
        INSERT INTO boarding_sessions (
          route_id,
          device_id,
          current_state,
          current_progress,
          is_simulated
        ) VALUES (
          ${route.id},
          ${deviceId},
          'IN_TRANSIT'::mobility_state,
          ${Math.random() * 0.5},
          true
        )
        ON CONFLICT DO NOTHING
      `;
      console.log(`  ✓ Created session for ${route.name}`);
    } catch (error) {
      console.warn(`  ⚠️  Failed for ${route.name}`);
    }
  }

  // Initialize simulation with routes
  console.log("\nInitializing simulation...");
  const simulation = getSimulation({ seed: 42 });
  simulation.loadRoutes(routes);
  simulation.initializeVehicles();

  console.log(`✓ Simulation initialized with ${routes.length} routes\n`);

  // Create virtual vehicles in database
  console.log("Creating virtual vehicles...");
  const vehicles = simulation.getVirtualVehicles();

  for (const vehicle of vehicles) {
    try {
      await sql`
        INSERT INTO virtual_vehicles (
          id,
          route_id,
          progress,
          speed,
          heading,
          passenger_count,
          confidence,
          current_location,
          is_simulated
        ) VALUES (
          ${vehicle.id},
          ${vehicle.routeId},
          ${vehicle.progress},
          ${vehicle.speed},
          ${vehicle.heading},
          ${vehicle.passengerCount},
          ${vehicle.confidence}::confidence_level,
          ST_SetSRID(ST_MakePoint(${vehicle.currentPosition.lon}, ${vehicle.currentPosition.lat}), 4326),
          true
        )
        ON CONFLICT (id) DO UPDATE SET
          progress = EXCLUDED.progress,
          speed = EXCLUDED.speed,
          passenger_count = EXCLUDED.passenger_count,
          current_location = EXCLUDED.current_location,
          last_update_at = NOW()
      `;
    } catch (error) {
      // Ignore errors
    }
  }

  console.log(`✓ Created ${vehicles.length} virtual vehicles\n`);

  // Summary
  const sessionCount = await sql`
    SELECT COUNT(*) as count FROM boarding_sessions WHERE ended_at IS NULL
  `;
  const vehicleCount = await sql`
    SELECT COUNT(*) as count FROM virtual_vehicles
  `;

  console.log("Seed Summary");
  console.log("------------");
  console.log(`Active Sessions: ${sessionCount[0].count}`);
  console.log(`Virtual Vehicles: ${vehicleCount[0].count}`);

  console.log("\n✓ Seeding complete!");
  process.exit(0);
}

main().catch((error) => {
  console.error("Seeding failed:", error);
  process.exit(1);
});
