// ============================================================================
// Route Service
// Handles route data queries from PostGIS
// ============================================================================

import { db } from "../db/connection";
import type { Route, RouteWithVehicles, Stop, StopWithEta } from "../types";
import { getSimulation } from "../simulation/engine";

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
  return "Combi"; // Default for Morelia
}

export async function getAllRoutes(): Promise<Route[]> {
  const result = await db.query`
    SELECT
      id, ref, name, mode::text, color, osm_id, variantes,
      paradas_count, sin_nombre, fuente::text,
      ST_AsGeoJSON(geometry)::json as geometry,
      total_length_m,
      created_at
    FROM routes
    ORDER BY name
  `;

  return result.map((row: any) => ({
    id: row.id,
    ref: row.ref,
    name: row.name,
    mode: row.mode,
    color: row.color,
    osmId: row.osm_id,
    variantes: row.variantes,
    paradasCount: row.paradas_count,
    sinNombre: row.sin_nombre,
    fuente: row.fuente,
    geometry: row.geometry,
    totalLengthM: row.total_length_m,
    createdAt: row.created_at,
  }));
}

export async function getRouteById(routeId: string): Promise<Route | null> {
  const result = await db.query`
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
    mode: row.mode,
    color: row.color,
    osmId: row.osm_id,
    variantes: row.variantes,
    paradasCount: row.paradas_count,
    sinNombre: row.sin_nombre,
    fuente: row.fuente,
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

  const simulation = getSimulation();
  const vehicles = simulation.getRouteVehicles(routeId);

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

export async function getRoutesNearPoint(
  lat: number,
  lon: number,
  radiusMeters: number = 500
): Promise<Route[]> {
  const result = await db.query`
    SELECT
      id, ref, name, mode::text, color, osm_id, variantes,
      paradas_count, sin_nombre, fuente::text,
      ST_AsGeoJSON(geometry)::json as geometry,
      total_length_m,
      created_at,
      ST_Distance(geometry::geography, ST_SetSRID(ST_MakePoint(${lon}, ${lat}), 4326)::geography) as distance
    FROM routes
    WHERE ST_DWithin(
      geometry::geography,
      ST_SetSRID(ST_MakePoint(${lon}, ${lat}), 4326)::geography,
      ${radiusMeters}
    )
    ORDER BY distance
    LIMIT 20
  `;

  return result.map((row: any) => ({
    id: row.id,
    ref: row.ref,
    name: row.name,
    mode: row.mode,
    color: row.color,
    osmId: row.osm_id,
    variantes: row.variantes,
    paradasCount: row.paradas_count,
    sinNombre: row.sin_nombre,
    fuente: row.fuente,
    geometry: row.geometry,
    totalLengthM: row.total_length_m,
    createdAt: row.created_at,
  }));
}

export async function getAllStops(): Promise<Stop[]> {
  const result = await db.query`
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
  `;

  return result.map((row: any) => ({
    id: row.id,
    name: row.name,
    coordinates: { lat: row.lat, lon: row.lon },
    routeIds: row.route_ids || [],
    createdAt: row.created_at,
  }));
}

export async function getStopById(stopId: string): Promise<Stop | null> {
  const result = await db.query`
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
  const result = await db.query`
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

  return result.map((row: any) => ({
    id: row.id,
    name: row.name,
    coordinates: { lat: row.lat, lon: row.lon },
    routeIds: row.route_ids || [],
    createdAt: row.created_at,
  }));
}

// Import routes from GeoJSON (used by seed script)
export async function importRoutesFromGeoJSON(
  geojson: any,
  colorIndex: number = 0
): Promise<number> {
  let imported = 0;

  for (const feature of geojson.features) {
    const props = feature.properties || {};
    const id = feature.id || props.ref || props.nombre || `route-${imported}`;

    // Build MultiLineString if needed
    let geometryJson: string;
    if (feature.geometry.type === "LineString") {
      geometryJson = JSON.stringify({
        type: "MultiLineString",
        coordinates: [feature.geometry.coordinates],
      });
    } else {
      geometryJson = JSON.stringify(feature.geometry);
    }

    const mode = inferMode(props.nombre || id);
    const color = ROUTE_COLORS[(colorIndex + imported) % ROUTE_COLORS.length];

    await db.query`
      INSERT INTO routes (
        id, ref, name, mode, color, osm_id, variantes,
        paradas_count, sin_nombre, fuente, geometry, total_length_m
      ) VALUES (
        ${id},
        ${props.ref || id},
        ${props.nombre || props.ref || id},
        ${mode}::transport_mode,
        ${color},
        ${props.osmid || null},
        ${props.variantes || 1},
        ${props.paradas || 0},
        ${props.sin_nombre || false},
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
  }

  return imported;
}

// Import stops from GeoJSON
export async function importStopsFromGeoJSON(geojson: any): Promise<number> {
  let imported = 0;

  for (const feature of geojson.features) {
    if (feature.geometry.type !== "Point") continue;

    const props = feature.properties || {};
    const [lon, lat] = feature.geometry.coordinates;

    await db.query`
      INSERT INTO stops (name, location)
      VALUES (
        ${props.nombre || null},
        ST_SetSRID(ST_MakePoint(${lon}, ${lat}), 4326)
      )
      ON CONFLICT DO NOTHING
    `;

    imported++;
  }

  return imported;
}
