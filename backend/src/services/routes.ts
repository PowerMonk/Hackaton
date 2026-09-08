// ============================================================================
// Route Service
// Handles route data queries from PostGIS
// ============================================================================

import { sql } from "../db/connection";
import type { Route, RouteWithVehicles, Stop } from "../types";
import { getVirtualVehicles } from "./mobility";

// Color palette matching Flutter app
const ROUTE_COLORS = [
  "#C94C28", // Terracotta
  "#176B48", // Teal
  "#1B2738", // Navy
  "#A87300", // Amber
  "#5C4B9B", // Purple
  "#2E7D8A", // Cyan
];

function inferMode(name: string): "Combi" | "Micro" | "Camión" | "Bus" {
  const lower = name.toLowerCase();
  if (lower.includes("combi")) return "Combi";
  if (lower.includes("micro")) return "Micro";
  if (lower.includes("camión") || lower.includes("camion")) return "Camión";
  return "Combi";
}

export async function getAllRoutes(): Promise<Route[]> {
  const result = await sql`
    SELECT
      id, ref, name, mode::text, color, osm_id, variantes,
      paradas_count, sin_nombre, fuente::text,
      ST_AsGeoJSON(geometry)::json as geometry,
      total_length_m,
      created_at
    FROM routes
    ORDER BY name
    LIMIT 1000
  `;

  return result.map((row) => ({
    id: row.id,
    ref: row.ref,
    name: row.name,
    mode: row.mode as Route["mode"],
    color: row.color,
    osmId: row.osm_id,
    variantes: row.variantes,
    paradasCount: row.paradas_count,
    sinNombre: row.sin_nombre,
    fuente: row.fuente as Route["fuente"],
    geometry: row.geometry,
    totalLengthM: row.total_length_m,
    createdAt: row.created_at,
  }));
}

export async function getRouteById(routeId: string): Promise<Route | null> {
  const result = await sql`
    SELECT
      id, ref, name, mode::text, color, osm_id, variantes,
      paradas_count, sin_nombre, fuente::text,
      ST_AsGeoJSON(geometry)::json as geometry,
      total_length_m,
      created_at
    FROM routes
    WHERE id = ${routeId}
    LIMIT 1
  `;

  if (result.length === 0) return null;

  const row = result[0];
  return {
    id: row.id,
    ref: row.ref,
    name: row.name,
    mode: row.mode as Route["mode"],
    color: row.color,
    osmId: row.osm_id,
    variantes: row.variantes,
    paradasCount: row.paradas_count,
    sinNombre: row.sin_nombre,
    fuente: row.fuente as Route["fuente"],
    geometry: row.geometry,
    totalLengthM: row.total_length_m,
    createdAt: row.created_at,
  };
}

export async function getRouteWithVehicles(
  routeId: string
): Promise<RouteWithVehicles | null> {
  const route = await getRouteById(routeId);
  if (!route) return null;

  const vehicles = await getVirtualVehicles(routeId);

  const activePassengers = vehicles.reduce(
    (sum, v) => sum + v.passengerCount,
    0
  );

  return {
    ...route,
    vehicles,
    activePassengers,
  };
}

export async function getAllStops(): Promise<Stop[]> {
  const result = await sql`
    SELECT
      s.id,
      s.name,
      ST_X(s.location) as lon,
      ST_Y(s.location) as lat,
      COALESCE(
        array_agg(rs.route_id) FILTER (WHERE rs.route_id IS NOT NULL),
        ARRAY[]::text[]
      ) as route_ids,
      s.created_at
    FROM stops s
    LEFT JOIN route_stops rs ON s.id = rs.stop_id
    GROUP BY s.id
    ORDER BY s.name NULLS LAST
    LIMIT 1000
  `;

  return result.map((row) => ({
    id: row.id,
    name: row.name,
    coordinates: { lat: row.lat, lon: row.lon },
    routeIds: row.route_ids || [],
    createdAt: row.created_at,
  }));
}

export async function getStopById(stopId: string): Promise<Stop | null> {
  const result = await sql`
    SELECT
      s.id,
      s.name,
      ST_X(s.location) as lon,
      ST_Y(s.location) as lat,
      COALESCE(
        array_agg(rs.route_id) FILTER (WHERE rs.route_id IS NOT NULL),
        ARRAY[]::text[]
      ) as route_ids,
      s.created_at
    FROM stops s
    LEFT JOIN route_stops rs ON s.id = rs.stop_id
    WHERE s.id = ${stopId}
    GROUP BY s.id
    LIMIT 1
  `;

  if (result.length === 0) return null;

  const row = result[0];
  return {
    id: row.id,
    name: row.name,
    coordinates: { lat: row.lat, lon: row.lon },
    routeIds: row.route_ids || [],
    createdAt: row.created_at,
  };
}

export async function getStopsNearPoint(
  lat: number,
  lon: number,
  radiusMeters: number = 300
): Promise<Stop[]> {
  const result = await sql`
    SELECT
      s.id,
      s.name,
      ST_X(s.location) as lon,
      ST_Y(s.location) as lat,
      COALESCE(
        array_agg(rs.route_id) FILTER (WHERE rs.route_id IS NOT NULL),
        ARRAY[]::text[]
      ) as route_ids,
      s.created_at,
      ST_Distance(s.location::geography, ST_SetSRID(ST_MakePoint(${lon}, ${lat}), 4326)::geography) as distance
    FROM stops s
    LEFT JOIN route_stops rs ON s.id = rs.stop_id
    WHERE ST_DWithin(
      s.location::geography,
      ST_SetSRID(ST_MakePoint(${lon}, ${lat}), 4326)::geography,
      ${radiusMeters}
    )
    GROUP BY s.id
    ORDER BY distance
    LIMIT 10
  `;

  return result.map((row) => ({
    id: row.id,
    name: row.name,
    coordinates: { lat: row.lat, lon: row.lon },
    routeIds: row.route_ids || [],
    createdAt: row.created_at,
  }));
}

// ============================================================================
// Import Functions (idempotent)
// ============================================================================

export async function importRoutesFromGeoJSON(
  geojson: { features: any[] },
  colorIndex: number = 0
): Promise<number> {
  let imported = 0;

  for (const feature of geojson.features) {
    const props = feature.properties || {};

    // Use stable ID: feature.id > ref > nombre > osmid
    const stableId =
      feature.id?.toString() ||
      props.ref ||
      props.nombre ||
      (props.osmid ? `osm-${props.osmid}` : null);

    if (!stableId) {
      console.warn("Skipping route without stable ID");
      continue;
    }

    // Normalize to MultiLineString
    let geometry: { type: string; coordinates: number[][][] };
    if (feature.geometry.type === "LineString") {
      geometry = {
        type: "MultiLineString",
        coordinates: [feature.geometry.coordinates],
      };
    } else if (feature.geometry.type === "MultiLineString") {
      geometry = feature.geometry;
    } else {
      console.warn(`Skipping unsupported geometry type: ${feature.geometry.type}`);
      continue;
    }

    const geometryJson = JSON.stringify(geometry);
    const mode = inferMode(props.nombre || stableId);
    const color = ROUTE_COLORS[(colorIndex + imported) % ROUTE_COLORS.length];
    const name = props.nombre || props.ref || stableId;

    try {
      await sql`
        INSERT INTO routes (
          id, ref, name, mode, color, osm_id, variantes,
          paradas_count, sin_nombre, fuente, geometry, total_length_m
        ) VALUES (
          ${stableId},
          ${props.ref || stableId},
          ${name},
          ${mode}::transport_mode,
          ${color},
          ${props.osmid || null},
          ${props.variantes || 1},
          ${props.paradas || 0},
          ${props.sin_nombre || !props.nombre},
          'osm-demo'::data_source,
          ST_SetSRID(ST_GeomFromGeoJSON(${geometryJson}), 4326),
          ST_Length(ST_SetSRID(ST_GeomFromGeoJSON(${geometryJson}), 4326)::geography)
        )
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          geometry = EXCLUDED.geometry,
          total_length_m = EXCLUDED.total_length_m,
          updated_at = NOW()
      `;
      imported++;
    } catch (error) {
      console.error(`Failed to import route ${stableId}:`, error);
    }
  }

  return imported;
}

export async function importStopsFromGeoJSON(
  geojson: { features: any[] }
): Promise<number> {
  let imported = 0;

  for (const feature of geojson.features) {
    if (feature.geometry?.type !== "Point") continue;

    const props = feature.properties || {};
    const [lon, lat] = feature.geometry.coordinates;

    // Create deterministic ID from coordinates
    const stableId = `stop-${lat.toFixed(6)}-${lon.toFixed(6)}`.replace(/\./g, "_");

    try {
      await sql`
        INSERT INTO stops (id, name, location)
        VALUES (
          ${stableId},
          ${props.nombre || null},
          ST_SetSRID(ST_MakePoint(${lon}, ${lat}), 4326)
        )
        ON CONFLICT (id) DO UPDATE SET
          name = COALESCE(EXCLUDED.name, stops.name)
      `;
      imported++;
    } catch (error) {
      console.error(`Failed to import stop:`, error);
    }
  }

  return imported;
}

export async function linkStopsToRoutes(): Promise<number> {
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
    RETURNING route_id
  `;

  // Update paradas_count
  await sql`
    UPDATE routes r
    SET paradas_count = (
      SELECT COUNT(*) FROM route_stops rs WHERE rs.route_id = r.id
    )
  `;

  return result.length;
}

export async function getRouteCount(): Promise<number> {
  const [result] = await sql`SELECT COUNT(*) as count FROM routes`;
  return Number(result?.count || 0);
}

export async function getStopCount(): Promise<number> {
  const [result] = await sql`SELECT COUNT(*) as count FROM stops`;
  return Number(result?.count || 0);
}
