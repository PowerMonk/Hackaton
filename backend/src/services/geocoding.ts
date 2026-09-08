// ============================================================================
// Geocoding Service
// Uses Geoapify for address search with fallback to mock data
// ============================================================================

import type { AddressSuggestion } from "../types";

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

  // Try Geoapify if API key is available
  if (GEOAPIFY_API_KEY) {
    try {
      const results = await geoapifyAutocomplete(query, limit);
      suggestionCache.set(cacheKey, { data: results, timestamp: Date.now() });
      return results;
    } catch (error) {
      console.warn("Geoapify autocomplete failed, using mock data:", error);
    }
  }

  // Fallback to mock data
  const mockResults = searchMockSuggestions(query, limit);
  suggestionCache.set(cacheKey, { data: mockResults, timestamp: Date.now() });
  return mockResults;
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

  // Fallback: find nearest mock location
  const nearest = findNearestMockLocation(lat, lon);
  if (nearest) {
    suggestionCache.set(cacheKey, { data: [nearest], timestamp: Date.now() });
  }
  return nearest;
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
