// ============================================================================
// Generate Synthetic Stops from Routes
// Creates stop points along route geometries at regular intervals
// ============================================================================

import { sql } from "../db/connection";
import { getAllRoutes } from "../services/routes";

// Generate stops every N meters along route
const STOP_INTERVAL_METERS = 400; // ~5 min walk between stops

interface SyntheticStop {
  lat: number;
  lon: number;
  routeIds: string[];
  name: string;
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

function interpolatePoint(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
  fraction: number
): [number, number] {
  return [
    lat1 + (lat2 - lat1) * fraction,
    lon1 + (lon2 - lon1) * fraction,
  ];
}

function generateStopsForRoute(routeId: string, routeName: string, coordinates: [number, number][]): SyntheticStop[] {
  const stops: SyntheticStop[] = [];

  let accumulatedDistance = 0;
  let nextStopDistance = STOP_INTERVAL_METERS;

  for (let i = 0; i < coordinates.length - 1; i++) {
    const [lon1, lat1] = coordinates[i];
    const [lon2, lat2] = coordinates[i + 1];

    const segmentDistance = haversineDistance(lat1, lon1, lat2, lon2);

    // Check if we should place stop(s) in this segment
    while (accumulatedDistance + segmentDistance >= nextStopDistance) {
      const remainingToStop = nextStopDistance - accumulatedDistance;
      const fraction = remainingToStop / segmentDistance;

      const [stopLat, stopLon] = interpolatePoint(lat1, lon1, lat2, lon2, fraction);

      stops.push({
        lat: stopLat,
        lon: stopLon,
        routeIds: [routeId],
        name: `${routeName} - Parada ${stops.length + 1}`,
      });

      nextStopDistance += STOP_INTERVAL_METERS;
    }

    accumulatedDistance += segmentDistance;
  }

  return stops;
}

function mergeNearbyStops(stops: SyntheticStop[], mergeRadius: number = 50): SyntheticStop[] {
  const merged: SyntheticStop[] = [];
  const used = new Set<number>();

  for (let i = 0; i < stops.length; i++) {
    if (used.has(i)) continue;

    const cluster = [stops[i]];
    const routeIds = new Set(stops[i].routeIds);

    for (let j = i + 1; j < stops.length; j++) {
      if (used.has(j)) continue;

      const distance = haversineDistance(
        stops[i].lat,
        stops[i].lon,
        stops[j].lat,
        stops[j].lon
      );

      if (distance <= mergeRadius) {
        cluster.push(stops[j]);
        stops[j].routeIds.forEach(id => routeIds.add(id));
        used.add(j);
      }
    }

    // Calculate centroid of cluster
    const avgLat = cluster.reduce((sum, s) => sum + s.lat, 0) / cluster.length;
    const avgLon = cluster.reduce((sum, s) => sum + s.lon, 0) / cluster.length;

    const routeIdArray = Array.from(routeIds);
    merged.push({
      lat: avgLat,
      lon: avgLon,
      routeIds: routeIdArray,
      name: routeIdArray.length > 1
        ? `Transbordo (${routeIdArray.length} rutas)`
        : stops[i].name,
    });

    used.add(i);
  }

  return merged;
}

async function generateAndInsertStops() {
  console.log("🚏 Generando paradas sintéticas desde rutas...\n");

  const routes = await getAllRoutes();
  console.log(`📍 Encontradas ${routes.length} rutas\n`);

  const allStops: SyntheticStop[] = [];

  for (const route of routes) {
    if (route.geometry.type !== "MultiLineString") {
      console.warn(`⚠️  Ruta ${route.name}: geometría no es MultiLineString`);
      continue;
    }

    for (const lineString of route.geometry.coordinates) {
      const routeStops = generateStopsForRoute(route.id, route.name, lineString);
      allStops.push(...routeStops);
    }

    console.log(`✓ ${route.name}: ${allStops.length} paradas acumuladas`);
  }

  console.log(`\n📊 Total paradas antes de fusionar: ${allStops.length}`);

  // Merge nearby stops (within 50m)
  console.log("🔄 Fusionando paradas cercanas (radio 50m)...");
  const mergedStops = mergeNearbyStops(allStops, 50);

  console.log(`📊 Total paradas después de fusionar: ${mergedStops.length}\n`);

  // Delete existing synthetic stops
  await sql`DELETE FROM stops WHERE id LIKE 'synthetic-%'`;
  console.log("🗑️  Paradas sintéticas anteriores eliminadas\n");

  // Insert new stops
  let inserted = 0;
  for (const stop of mergedStops) {
    try {
      await sql`
        INSERT INTO stops (id, name, location)
        VALUES (
          ${'synthetic-' + Math.random().toString(36).substring(2, 15)},
          ${stop.name},
          ST_SetSRID(ST_MakePoint(${stop.lon}, ${stop.lat}), 4326)
        )
      `;
      inserted++;
    } catch (error) {
      console.error(`Error insertando parada: ${error}`);
    }
  }

  console.log(`✅ Insertadas ${inserted} paradas sintéticas\n`);

  // Link synthetic stops to routes (route_stops) so the planner can find them
  console.log("🔗 Vinculando paradas sintéticas a rutas...");
  const linkResult = await sql`
    INSERT INTO route_stops (route_id, stop_id, route_progress)
    SELECT DISTINCT ON (r.id, s.id)
      r.id as route_id,
      s.id as stop_id,
      calculate_route_progress(r.geometry, s.location) as route_progress
    FROM routes r
    CROSS JOIN stops s
    WHERE s.id LIKE 'synthetic-%'
      AND ST_DWithin(r.geometry::geography, s.location::geography, 100)
    ON CONFLICT (route_id, stop_id) DO UPDATE SET
      route_progress = EXCLUDED.route_progress
    RETURNING route_id
  `;
  console.log(`✅ Vinculadas ${linkResult.length} relaciones ruta-parada`);

  await sql`
    UPDATE routes r
    SET paradas_count = (
      SELECT COUNT(*) FROM route_stops rs WHERE rs.route_id = r.id
    )
  `;

  // Show stats
  const [stopResult] = await sql`SELECT COUNT(*) as total FROM stops`;
  const [linkCount] = await sql`SELECT COUNT(*) as c FROM route_stops`;
  console.log(`📍 Total paradas en base de datos: ${stopResult.total}`);
  console.log(`📍 Total relaciones ruta-parada: ${linkCount.c}\n`);

  process.exit(0);
}

generateAndInsertStops().catch((error) => {
  console.error("❌ Error:", error);
  process.exit(1);
});
