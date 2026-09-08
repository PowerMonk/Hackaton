// ============================================================================
// Geocoding Service
// Uses Geoapify/Nominatim for address search with fallback to mock data
// Also searches transit stops from the database
// ============================================================================

import type { AddressSuggestion } from "../types";
import { sql } from "../db/connection";

interface GeoapifyResponse {
  features?: Array<{
    properties: {
      place_id?: string;
      osm_id?: string | number;
      formatted: string;
      city?: string;
      county?: string;
      category?: string;
    };
    geometry: { coordinates: [number, number] };
  }>;
}

const GEOAPIFY_API_KEY = process.env.GEOAPIFY_API_KEY;
const GEOAPIFY_BASE_URL = "https://api.geoapify.com/v1/geocode";
const NOMINATIM_BASE_URL = "https://nominatim.openstreetmap.org";
const USE_NOMINATIM = process.env.USE_NOMINATIM !== "false"; // Free alternative

// Mock suggestions for Morelia when API is unavailable
const MORELIA_MOCK_SUGGESTIONS: AddressSuggestion[] = [
  {
    id: "mock-1",
    label: "Centro Histórico, Morelia",
    lat: 19.7059,
    lon: -101.1950,
    city: "Morelia",
    category: "zona",
  },
  {
    id: "mock-2",
    label: "Catedral de Morelia",
    lat: 19.7028,
    lon: -101.1942,
    city: "Morelia",
    category: "monumento",
  },
  {
    id: "mock-3",
    label: "Plaza de Armas, Morelia",
    lat: 19.7031,
    lon: -101.1949,
    city: "Morelia",
    category: "plaza",
  },
  {
    id: "mock-4",
    label: "Mercado de Dulces, Morelia",
    lat: 19.7005,
    lon: -101.1867,
    city: "Morelia",
    category: "mercado",
  },
  {
    id: "mock-5",
    label: "Acueducto de Morelia",
    lat: 19.6990,
    lon: -101.1785,
    city: "Morelia",
    category: "monumento",
  },
  {
    id: "mock-6",
    label: "UMSNH Ciudad Universitaria",
    lat: 19.6754,
    lon: -101.2297,
    city: "Morelia",
    category: "universidad",
  },
  {
    id: "mock-7",
    label: "Instituto Tecnológico de Morelia",
    lat: 19.7217,
    lon: -101.1879,
    city: "Morelia",
    category: "universidad",
  },
  {
    id: "mock-8",
    label: "Central de Autobuses de Morelia",
    lat: 19.6977,
    lon: -101.1453,
    city: "Morelia",
    category: "terminal",
  },
  {
    id: "mock-9",
    label: "Plaza Morelia (Centro Comercial)",
    lat: 19.6884,
    lon: -101.1519,
    city: "Morelia",
    category: "comercio",
  },
  {
    id: "mock-10",
    label: "Estadio Morelos",
    lat: 19.6890,
    lon: -101.2055,
    city: "Morelia",
    category: "deportivo",
  },
  {
    id: "mock-11",
    label: "Hospital General de Morelia",
    lat: 19.6981,
    lon: -101.1763,
    city: "Morelia",
    category: "hospital",
  },
  {
    id: "mock-12",
    label: "Bosque Cuauhtémoc",
    lat: 19.7115,
    lon: -101.1915,
    city: "Morelia",
    category: "parque",
  },
  {
    id: "mock-13",
    label: "Palacio de Gobierno, Morelia",
    lat: 19.7033,
    lon: -101.1930,
    city: "Morelia",
    category: "gobierno",
  },
  {
    id: "mock-14",
    label: "Av. Madero Poniente, Morelia",
    lat: 19.7025,
    lon: -101.2076,
    city: "Morelia",
    category: "avenida",
  },
  {
    id: "mock-15",
    label: "Periférico Paseo de la República",
    lat: 19.6802,
    lon: -101.2213,
    city: "Morelia",
    category: "avenida",
  },
  // Colonias populares
  {
    id: "mock-16",
    label: "Colonia Chapultepec Norte",
    lat: 19.7185,
    lon: -101.1738,
    city: "Morelia",
    category: "colonia",
  },
  {
    id: "mock-17",
    label: "Colonia Félix Ireta",
    lat: 19.6925,
    lon: -101.2105,
    city: "Morelia",
    category: "colonia",
  },
  {
    id: "mock-18",
    label: "Colonia Ventura Puente",
    lat: 19.6842,
    lon: -101.1835,
    city: "Morelia",
    category: "colonia",
  },
  {
    id: "mock-19",
    label: "Las Américas, Morelia",
    lat: 19.6731,
    lon: -101.1612,
    city: "Morelia",
    category: "colonia",
  },
  {
    id: "mock-20",
    label: "Tres Puentes, Morelia",
    lat: 19.7145,
    lon: -101.2035,
    city: "Morelia",
    category: "colonia",
  },
  // Centros comerciales y mercados
  {
    id: "mock-21",
    label: "Centro Comercial Las Américas",
    lat: 19.6698,
    lon: -101.1582,
    city: "Morelia",
    category: "comercio",
  },
  {
    id: "mock-22",
    label: "Mercado Independencia",
    lat: 19.7018,
    lon: -101.1912,
    city: "Morelia",
    category: "mercado",
  },
  {
    id: "mock-23",
    label: "Mercado San Juan",
    lat: 19.7062,
    lon: -101.1987,
    city: "Morelia",
    category: "mercado",
  },
  // Hospitales y clínicas
  {
    id: "mock-24",
    label: "Hospital Star Médica Morelia",
    lat: 19.6825,
    lon: -101.1615,
    city: "Morelia",
    category: "hospital",
  },
  {
    id: "mock-25",
    label: "IMSS Clínica 1, Morelia",
    lat: 19.7095,
    lon: -101.1825,
    city: "Morelia",
    category: "hospital",
  },
  // Escuelas y universidades
  {
    id: "mock-26",
    label: "Universidad Latina de América (UNLA)",
    lat: 19.6715,
    lon: -101.2185,
    city: "Morelia",
    category: "universidad",
  },
  {
    id: "mock-27",
    label: "Preparatoria UMSNH 1",
    lat: 19.7085,
    lon: -101.1895,
    city: "Morelia",
    category: "escuela",
  },
  // Parques y recreación
  {
    id: "mock-28",
    label: "Parque Zoológico de Morelia",
    lat: 19.6752,
    lon: -101.2258,
    city: "Morelia",
    category: "parque",
  },
  {
    id: "mock-29",
    label: "Calzada Fray Antonio de San Miguel",
    lat: 19.6995,
    lon: -101.1835,
    city: "Morelia",
    category: "avenida",
  },
  {
    id: "mock-30",
    label: "Jardín de las Rosas",
    lat: 19.7045,
    lon: -101.1925,
    city: "Morelia",
    category: "plaza",
  },
];

// In-memory cache for recent queries
const suggestionCache = new Map<string, { data: AddressSuggestion[]; timestamp: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export async function autocomplete(
  query: string,
  limit: number = 5
): Promise<AddressSuggestion[]> {
  if (!query || query.length < 2) {
    return [];
  }

  const cacheKey = `autocomplete:${query.toLowerCase()}:${limit}`;
  const cached = suggestionCache.get(cacheKey);

  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.data;
  }

  // Search transit stops from database first (most relevant for transit app)
  const stopResults = await searchTransitStops(query, Math.min(limit, 3));

  // Try Geoapify if API key is available
  if (GEOAPIFY_API_KEY) {
    try {
      const geocodeResults = await geoapifyAutocomplete(query, limit);
      const combined = mergeAndDeduplicateResults(stopResults, geocodeResults, limit);
      suggestionCache.set(cacheKey, { data: combined, timestamp: Date.now() });
      return combined;
    } catch (error) {
      console.warn("Geoapify autocomplete failed:", error);
    }
  }

  // Try Nominatim (free, no API key required)
  if (USE_NOMINATIM) {
    try {
      const geocodeResults = await nominatimAutocomplete(query, limit);
      const combined = mergeAndDeduplicateResults(stopResults, geocodeResults, limit);
      suggestionCache.set(cacheKey, { data: combined, timestamp: Date.now() });
      return combined;
    } catch (error) {
      console.warn("Nominatim autocomplete failed:", error);
    }
  }

  // Fallback to mock data + stops
  const mockResults = searchMockSuggestions(query, limit);
  const combined = mergeAndDeduplicateResults(stopResults, mockResults, limit);
  suggestionCache.set(cacheKey, { data: combined, timestamp: Date.now() });
  return combined;
}

export async function reverseGeocode(
  lat: number,
  lon: number
): Promise<AddressSuggestion | null> {
  const cacheKey = `reverse:${lat.toFixed(5)}:${lon.toFixed(5)}`;
  const cached = suggestionCache.get(cacheKey);

  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.data[0] || null;
  }

  // First, check if there's a nearby transit stop
  const nearbyStop = await findNearestTransitStop(lat, lon, 100);
  if (nearbyStop) {
    suggestionCache.set(cacheKey, { data: [nearbyStop], timestamp: Date.now() });
    return nearbyStop;
  }

  // Try Geoapify if API key is available
  if (GEOAPIFY_API_KEY) {
    try {
      const result = await geoapifyReverse(lat, lon);
      if (result) {
        suggestionCache.set(cacheKey, { data: [result], timestamp: Date.now() });
        return result;
      }
    } catch (error) {
      console.warn("Geoapify reverse geocode failed:", error);
    }
  }

  // Try Nominatim (free)
  if (USE_NOMINATIM) {
    try {
      const result = await nominatimReverse(lat, lon);
      if (result) {
        suggestionCache.set(cacheKey, { data: [result], timestamp: Date.now() });
        return result;
      }
    } catch (error) {
      console.warn("Nominatim reverse geocode failed:", error);
    }
  }

  // Fallback: find nearest mock location
  const nearest = findNearestMockLocation(lat, lon);
  if (nearest) {
    suggestionCache.set(cacheKey, { data: [nearest], timestamp: Date.now() });
  }
  return nearest;
}

async function findNearestTransitStop(
  lat: number,
  lon: number,
  radiusMeters: number
): Promise<AddressSuggestion | null> {
  try {
    const result = await sql`
      SELECT
        s.id,
        s.name,
        ST_Y(s.location::geometry) as lat,
        ST_X(s.location::geometry) as lon,
        ST_Distance(
          s.location::geography,
          ST_SetSRID(ST_MakePoint(${lon}, ${lat}), 4326)::geography
        ) as distance_m
      FROM stops s
      WHERE s.name IS NOT NULL
        AND ST_DWithin(
          s.location::geography,
          ST_SetSRID(ST_MakePoint(${lon}, ${lat}), 4326)::geography,
          ${radiusMeters}
        )
      ORDER BY distance_m
      LIMIT 1
    `;

    if (result.length === 0) return null;

    const row = result[0];
    return {
      id: `stop-${row.id}`,
      label: `${row.name} (parada)`,
      lat: Number(row.lat),
      lon: Number(row.lon),
      city: "Morelia",
      category: "parada",
    };
  } catch (error) {
    console.warn("Nearest transit stop search failed:", error);
    return null;
  }
}

async function nominatimReverse(
  lat: number,
  lon: number
): Promise<AddressSuggestion | null> {
  const params = new URLSearchParams({
    lat: String(lat),
    lon: String(lon),
    format: "json",
    addressdetails: "1",
  });

  const response = await fetch(`${NOMINATIM_BASE_URL}/reverse?${params}`, {
    headers: {
      "User-Agent": "MoreliaConecta/1.0 (https://github.com/morelia-conecta)",
      "Accept-Language": "es",
    },
  });

  if (!response.ok) {
    throw new Error(`Nominatim error: ${response.status}`);
  }

  const data = (await response.json()) as NominatimResult;

  if (!data.display_name) return null;

  return {
    id: `nom-${data.place_id}`,
    label: formatNominatimLabel(data.display_name),
    lat: parseFloat(data.lat),
    lon: parseFloat(data.lon),
    city: data.address?.city || data.address?.town || "Morelia",
    category: data.type || data.class,
  };
}

// ==========================================================================
// Transit Stop Search (from database)
// ==========================================================================

async function searchTransitStops(
  query: string,
  limit: number
): Promise<AddressSuggestion[]> {
  try {
    const result = await sql`
      SELECT
        s.id,
        s.name,
        ST_Y(s.location::geometry) as lat,
        ST_X(s.location::geometry) as lon,
        array_agg(DISTINCT rs.route_id) as route_ids
      FROM stops s
      LEFT JOIN route_stops rs ON rs.stop_id = s.id
      WHERE s.name IS NOT NULL
        AND s.name ILIKE ${'%' + query + '%'}
      GROUP BY s.id, s.name, s.location
      ORDER BY
        CASE WHEN s.name ILIKE ${query + '%'} THEN 0 ELSE 1 END,
        s.name
      LIMIT ${limit}
    `;

    return result.map((row) => ({
      id: `stop-${row.id}`,
      label: row.name,
      lat: Number(row.lat),
      lon: Number(row.lon),
      city: "Morelia",
      category: "parada",
    }));
  } catch (error) {
    console.warn("Transit stop search failed:", error);
    return [];
  }
}

// ==========================================================================
// Nominatim API (Free, no API key required)
// ==========================================================================

interface NominatimResult {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
  type?: string;
  class?: string;
  address?: {
    city?: string;
    town?: string;
    village?: string;
  };
}

async function nominatimAutocomplete(
  query: string,
  limit: number
): Promise<AddressSuggestion[]> {
  const params = new URLSearchParams({
    q: `${query}, Morelia, Michoacán, Mexico`,
    format: "json",
    limit: String(limit),
    addressdetails: "1",
    // Bounding box for Morelia area
    viewbox: "-101.35,19.60,-101.05,19.80",
    bounded: "1",
  });

  const response = await fetch(`${NOMINATIM_BASE_URL}/search?${params}`, {
    headers: {
      "User-Agent": "MoreliaConecta/1.0 (https://github.com/morelia-conecta)",
      "Accept-Language": "es",
    },
  });

  if (!response.ok) {
    throw new Error(`Nominatim error: ${response.status}`);
  }

  const data = (await response.json()) as NominatimResult[];

  return data.map((result) => ({
    id: `nom-${result.place_id}`,
    label: formatNominatimLabel(result.display_name),
    lat: parseFloat(result.lat),
    lon: parseFloat(result.lon),
    city: result.address?.city || result.address?.town || result.address?.village || "Morelia",
    category: result.type || result.class,
  }));
}

function formatNominatimLabel(displayName: string): string {
  // Nominatim returns very long labels, shorten them
  const parts = displayName.split(", ");
  // Keep first 3-4 parts (usually most relevant)
  const relevantParts = parts.slice(0, Math.min(4, parts.length));
  // Remove redundant "Morelia" and "Michoacán" if already at start
  return relevantParts
    .filter((p, i) => i === 0 || (p !== "Morelia" && p !== "Michoacán de Ocampo" && p !== "México"))
    .join(", ");
}

// ==========================================================================
// Result Merging
// ==========================================================================

function mergeAndDeduplicateResults(
  stopResults: AddressSuggestion[],
  geocodeResults: AddressSuggestion[],
  limit: number
): AddressSuggestion[] {
  // Stops first (most relevant for transit app), then geocode results
  const combined = [...stopResults];
  const seenLabels = new Set(stopResults.map(s => s.label.toLowerCase()));

  for (const result of geocodeResults) {
    if (!seenLabels.has(result.label.toLowerCase())) {
      combined.push(result);
      seenLabels.add(result.label.toLowerCase());
    }
    if (combined.length >= limit) break;
  }

  return combined.slice(0, limit);
}

// ==========================================================================
// Geoapify API Calls
// ==========================================================================

async function geoapifyAutocomplete(
  query: string,
  limit: number
): Promise<AddressSuggestion[]> {
  const params = new URLSearchParams({
    text: query,
    limit: String(limit),
    apiKey: GEOAPIFY_API_KEY!,
    // Bias results toward Morelia
    bias: "proximity:-101.1950,19.7059",
    filter: "countrycode:mx",
    lang: "es",
  });

  const response = await fetch(`${GEOAPIFY_BASE_URL}/autocomplete?${params}`);

  if (!response.ok) {
    throw new Error(`Geoapify error: ${response.status}`);
  }

  const data = (await response.json()) as GeoapifyResponse;

  return (data.features || []).map((feature: any) => ({
    id: feature.properties.place_id || feature.properties.osm_id || crypto.randomUUID(),
    label: feature.properties.formatted,
    lat: feature.geometry.coordinates[1],
    lon: feature.geometry.coordinates[0],
    city: feature.properties.city || feature.properties.county,
    category: feature.properties.category,
  }));
}

async function geoapifyReverse(
  lat: number,
  lon: number
): Promise<AddressSuggestion | null> {
  const params = new URLSearchParams({
    lat: String(lat),
    lon: String(lon),
    apiKey: GEOAPIFY_API_KEY!,
    lang: "es",
  });

  const response = await fetch(`${GEOAPIFY_BASE_URL}/reverse?${params}`);

  if (!response.ok) {
    throw new Error(`Geoapify error: ${response.status}`);
  }

  const data = (await response.json()) as GeoapifyResponse;

  if (!data.features || data.features.length === 0) {
    return null;
  }

  const feature = data.features[0];
  return {
    id: feature.properties.place_id || crypto.randomUUID(),
    label: feature.properties.formatted,
    lat: feature.geometry.coordinates[1],
    lon: feature.geometry.coordinates[0],
    city: feature.properties.city || feature.properties.county,
    category: feature.properties.category,
  };
}

// ==========================================================================
// Mock Data Helpers
// ==========================================================================

function searchMockSuggestions(query: string, limit: number): AddressSuggestion[] {
  const lowerQuery = query.toLowerCase();

  return MORELIA_MOCK_SUGGESTIONS
    .filter((s) =>
      s.label.toLowerCase().includes(lowerQuery) ||
      (s.category && s.category.toLowerCase().includes(lowerQuery))
    )
    .slice(0, limit);
}

function findNearestMockLocation(lat: number, lon: number): AddressSuggestion | null {
  let nearest: AddressSuggestion | null = null;
  let minDistance = Infinity;

  for (const suggestion of MORELIA_MOCK_SUGGESTIONS) {
    const distance = Math.sqrt(
      Math.pow(suggestion.lat - lat, 2) + Math.pow(suggestion.lon - lon, 2)
    );
    if (distance < minDistance) {
      minDistance = distance;
      nearest = suggestion;
    }
  }

  return nearest;
}

// ==========================================================================
// Cache Management
// ==========================================================================

export function clearGeocodingCache(): void {
  suggestionCache.clear();
}

export function getGeocodingCacheStats(): { size: number; entries: number } {
  return {
    size: suggestionCache.size,
    entries: suggestionCache.size,
  };
}
