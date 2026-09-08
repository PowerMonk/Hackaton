// ============================================================================
// HTTP demo replay
// ============================================================================

import { GPSNoiseGenerator, LCG } from "./prng";

export const REPLAY_SPEED_MULTIPLIERS = [1, 5, 10] as const;
export type ReplaySpeedMultiplier = (typeof REPLAY_SPEED_MULTIPLIERS)[number];

const DEFAULT_BASE_URL = "http://localhost:3000";
const DEFAULT_SEED = 42;
const DEFAULT_SPEED_MULTIPLIER: ReplaySpeedMultiplier = 1;
const DEFAULT_STEPS = 12;
const DEFAULT_INTERVAL_SECONDS = 2;
const DEFAULT_PASSENGERS = 3;
const DEFAULT_REQUEST_TIMEOUT_MS = 10_000;

type Point = [number, number];

interface RouteGeometry {
  type: "LineString" | "MultiLineString";
  coordinates: Point[] | Point[][];
}

interface RouteSummary {
  id: string;
  geometry?: RouteGeometry;
}

interface RouteListResponse {
  routes?: RouteSummary[];
}

interface LocalGeoJsonResponse {
  features?: Array<{
    id?: string;
    properties?: { ref?: string; nombre?: string };
    geometry?: RouteGeometry;
  }>;
}

export interface ReplayConfig {
  baseUrl: string;
  seed: number;
  speedMultiplier: ReplaySpeedMultiplier;
  steps: number;
  intervalSeconds: number;
  passengers: 2 | 3;
  requestTimeoutMs: number;
}

export interface ReplayStats {
  routeId: string;
  sessionsCreated: number;
  sessionsEnded: number;
  generatedSamples: number;
  sentSamples: number;
  failedSamples: number;
  discardedSamples: number;
  pausedSamples: number;
}

interface ReplayDependencies {
  fetchImpl?: typeof fetch;
  sleep?: (milliseconds: number) => Promise<void>;
  now?: () => number;
  log?: (message: string) => void;
}

interface PassengerState {
  index: number;
  sessionId: string;
  progress: number;
}

interface LocationPayload {
  sessionId: string;
  timestamp: number;
  lat: number;
  lon: number;
  accuracy: number;
  speed: number;
  heading: number;
  isSimulated: true;
}

/** Parse CLI flags and environment variables without depending on a CLI library. */
export function parseReplayConfig(
  args: string[] = process.argv.slice(2),
  env: Record<string, string | undefined> = process.env,
): ReplayConfig {
  const flags = new Map<string, string>();

  for (let index = 0; index < args.length; index++) {
    const argument = args[index];
    if (!argument.startsWith("--")) {
      throw new Error(`Unexpected argument: ${argument}`);
    }

    const equalsIndex = argument.indexOf("=");
    if (equalsIndex > 0) {
      flags.set(argument.slice(2, equalsIndex), argument.slice(equalsIndex + 1));
      continue;
    }

    const name = argument.slice(2);
    const value = args[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`Missing value for --${name}`);
    }
    flags.set(name, value);
    index++;
  }

  const value = (names: string[], fallback: string): string => {
    for (const name of names) {
      const flagValue = flags.get(name);
      if (flagValue !== undefined) return flagValue;
    }
    return fallback;
  };

  const baseUrl = normalizeBaseUrl(
    value(["base-url"], env.REPLAY_BASE_URL || env.BASE_URL || DEFAULT_BASE_URL),
  );
  const seed = parseInteger(value(["seed"], env.REPLAY_SEED || env.SEED || `${DEFAULT_SEED}`), "seed");
  const speedMultiplier = parseSpeedMultiplier(
    value(
      ["speed", "speed-multiplier"],
      env.REPLAY_SPEED_MULTIPLIER || env.SPEED_MULTIPLIER || `${DEFAULT_SPEED_MULTIPLIER}`,
    ),
  );
  const steps = parsePositiveInteger(
    value(["steps"], env.REPLAY_STEPS || `${DEFAULT_STEPS}`),
    "steps",
  );
  const intervalSeconds = parsePositiveNumber(
    value(["interval-seconds"], env.REPLAY_INTERVAL_SECONDS || `${DEFAULT_INTERVAL_SECONDS}`),
    "interval-seconds",
  );
  const passengersValue = parsePositiveInteger(
    value(["passengers"], env.REPLAY_PASSENGERS || `${DEFAULT_PASSENGERS}`),
    "passengers",
  );
  if (passengersValue !== 2 && passengersValue !== 3) {
    throw new Error("passengers must be 2 or 3");
  }

  const requestTimeoutMs = parsePositiveInteger(
    value(["request-timeout-ms"], env.REPLAY_REQUEST_TIMEOUT_MS || `${DEFAULT_REQUEST_TIMEOUT_MS}`),
    "request-timeout-ms",
  );

  return {
    baseUrl,
    seed,
    speedMultiplier,
    steps,
    intervalSeconds,
    passengers: passengersValue,
    requestTimeoutMs,
  };
}

/** Execute a small deterministic replay using only the public HTTP API. */
export async function runReplay(
  config: ReplayConfig,
  dependencies: ReplayDependencies = {},
): Promise<ReplayStats> {
  const fetchImpl = dependencies.fetchImpl || fetch;
  const sleep = dependencies.sleep || ((milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  const now = dependencies.now || (() => Date.now());
  const log = dependencies.log || (() => {});
  const routeRng = new LCG(config.seed);
  const sampleRng = new LCG(config.seed + 101);
  const gpsNoise = new GPSNoiseGenerator(config.seed + 202);

  const routesResponse = await requestJson<RouteListResponse>(fetchImpl, config, "/routes", {
    method: "GET",
  });
  let routes = (routesResponse.routes || []).filter((route) => typeof route?.id === "string");
  if (routes.length === 0) {
    // The API intentionally has no database-backed routes in simulation-only mode.
    routes = await loadLocalDemoRoutes();
  }
  if (routes.length === 0) {
    throw new Error("The backend returned no routes; import demo routes before running the replay");
  }

  const selectedSummary = routes[routeRng.int(0, routes.length - 1)];
  const routeResponse = await requestJson<RouteSummary>(
    fetchImpl,
    config,
    `/routes/${encodeURIComponent(selectedSummary.id)}`,
    { method: "GET" },
  );
  const route = routeResponse.geometry
    ? routeResponse
    : {
        ...selectedSummary,
        geometry: selectedSummary.geometry || await loadLocalDemoGeometry(selectedSummary.id),
      };
  const points = flattenGeometry(route.geometry);
  if (points.length < 2) {
    throw new Error(`Route ${selectedSummary.id} did not include a usable geometry`);
  }

  const routeLengthMeters = calculateRouteLength(points);
  const routeId = selectedSummary.id;
  const stats: ReplayStats = {
    routeId,
    sessionsCreated: 0,
    sessionsEnded: 0,
    generatedSamples: 0,
    sentSamples: 0,
    failedSamples: 0,
    discardedSamples: 0,
    pausedSamples: 0,
  };
  const sessions: string[] = [];
  const passengers: PassengerState[] = [];

  try {
    for (let index = 0; index < config.passengers; index++) {
      const response = await requestJson<{ id?: string }>(fetchImpl, config, "/boarding-sessions", {
        method: "POST",
        body: JSON.stringify({
          routeId,
          deviceId: `demo-replay-${config.seed}-passenger-${index + 1}`,
        }),
      });
      if (!response.id) throw new Error("The boarding session response did not contain an id");

      sessions.push(response.id);
      passengers.push({
        index,
        sessionId: response.id,
        progress: 0.08 + index * 0.045,
      });
      stats.sessionsCreated++;
    }

    const startedAt = now();
    const intervalMs = config.intervalSeconds * 1000;

    for (let step = 0; step < config.steps; step++) {
      for (const passenger of passengers) {
        const speedKmh = speedFor(passenger.index, step, sampleRng);
        const isPaused = speedKmh === 0;
        if (isPaused) stats.pausedSamples++;

        passenger.progress = Math.min(
          0.98,
          passenger.progress + (speedKmh / 3.6) * intervalMs / 1000 / routeLengthMeters,
        );
        stats.generatedSamples++;

        if (shouldDiscard(passenger.index, step, sampleRng)) {
          stats.discardedSamples++;
          log(`step ${step + 1}: discarded sample for passenger ${passenger.index + 1}`);
          continue;
        }

        const position = positionAtProgress(points, passenger.progress);
        const nextPosition = positionAtProgress(points, Math.min(1, passenger.progress + 0.005));
        const noise = gpsNoise.generateNoise(isPaused ? 6 : 8);
        const payload: LocationPayload = {
          sessionId: passenger.sessionId,
          timestamp: startedAt + step * intervalMs,
          lat: position.lat + noise.latOffset,
          lon: position.lon + noise.lonOffset,
          accuracy: sampleRng.range(5, 15),
          speed: speedKmh / 3.6,
          heading: calculateHeading(position, nextPosition),
          isSimulated: true,
        };

        try {
          await requestJson(fetchImpl, config, "/locations", {
            method: "POST",
            body: JSON.stringify(payload),
          });
          stats.sentSamples++;
        } catch (error) {
          stats.failedSamples++;
          log(`step ${step + 1}: location failed for passenger ${passenger.index + 1}: ${formatError(error)}`);
        }
      }

      if (step < config.steps - 1) {
        await sleep(intervalMs / config.speedMultiplier);
      }
    }
  } finally {
    for (const sessionId of sessions) {
      try {
        await requestJson(fetchImpl, config, `/boarding-sessions/${encodeURIComponent(sessionId)}`, {
          method: "DELETE",
        });
        stats.sessionsEnded++;
      } catch (error) {
        log(`could not end session ${sessionId}: ${formatError(error)}`);
      }
    }
  }

  return stats;
}

function speedFor(index: number, step: number, rng: LCG): number {
  // Explicit pauses make the replay visibly exercise WAITING state.
  if ((index === 1 && (step === 3 || step === 4)) || (index === 2 && step === 7)) return 0;

  const baseSpeedKmh = [24, 19, 28][index] || 22;
  return Math.max(8, baseSpeedKmh + rng.range(-3, 3));
}

function shouldDiscard(index: number, step: number, rng: LCG): boolean {
  // Keep deterministic drops in every default run, with a small seeded extra rate.
  const scheduledDrop = (index === 0 && step === 2) || (index === 1 && step === 5) || (index === 2 && step === 8);
  return scheduledDrop || rng.bool(0.04);
}

function flattenGeometry(geometry: RouteGeometry | undefined): Point[] {
  if (!geometry || !Array.isArray(geometry.coordinates)) return [];
  const coordinates = geometry.type === "LineString" ? [geometry.coordinates] : geometry.coordinates;
  return coordinates
    .flatMap((line) => line)
    .filter((point): point is Point =>
      Array.isArray(point) && point.length >= 2 && Number.isFinite(point[0]) && Number.isFinite(point[1]),
    )
    .map(([lon, lat]) => [lon, lat]);
}

async function loadLocalDemoRoutes(): Promise<RouteSummary[]> {
  const response = await loadLocalGeoJson();
  return (response.features || [])
    .map((feature) => ({
      id: feature.id || feature.properties?.ref || feature.properties?.nombre || "",
      geometry: feature.geometry,
    }))
    .filter((route) => route.id.length > 0 && Boolean(route.geometry))
    .map((route) => ({ id: route.id, geometry: route.geometry }));
}

async function loadLocalDemoGeometry(routeId: string): Promise<RouteGeometry | undefined> {
  const response = await loadLocalGeoJson();
  const feature = (response.features || []).find(
    (candidate) => (candidate.id || candidate.properties?.ref || candidate.properties?.nombre) === routeId,
  );
  return feature?.geometry;
}

async function loadLocalGeoJson(): Promise<LocalGeoJsonResponse> {
  const path = new URL("../../../mobile/assets/geojson/rutas_morelia.geojson", import.meta.url);
  const file = Bun.file(path);
  if (!(await file.exists())) return {};
  return await file.json() as LocalGeoJsonResponse;
}

function calculateRouteLength(points: Point[]): number {
  let length = 0;
  for (let index = 1; index < points.length; index++) {
    length += haversine(points[index - 1], points[index]);
  }
  return Math.max(1, length);
}

function positionAtProgress(points: Point[], progress: number): { lat: number; lon: number } {
  const target = calculateRouteLength(points) * Math.max(0, Math.min(1, progress));
  let traveled = 0;

  for (let index = 1; index < points.length; index++) {
    const segmentLength = haversine(points[index - 1], points[index]);
    if (traveled + segmentLength >= target || index === points.length - 1) {
      const ratio = segmentLength === 0 ? 0 : Math.min(1, (target - traveled) / segmentLength);
      return {
        lon: points[index - 1][0] + (points[index][0] - points[index - 1][0]) * ratio,
        lat: points[index - 1][1] + (points[index][1] - points[index - 1][1]) * ratio,
      };
    }
    traveled += segmentLength;
  }

  return { lon: points[points.length - 1][0], lat: points[points.length - 1][1] };
}

function calculateHeading(
  position: { lat: number; lon: number },
  nextPosition: { lat: number; lon: number },
): number {
  return (Math.atan2(nextPosition.lon - position.lon, nextPosition.lat - position.lat) * 180 / Math.PI + 360) % 360;
}

function haversine(first: Point, second: Point): number {
  const radius = 6_371_000;
  const lat1 = first[1] * Math.PI / 180;
  const lat2 = second[1] * Math.PI / 180;
  const dLat = lat2 - lat1;
  const dLon = (second[0] - first[0]) * Math.PI / 180;
  const value = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return radius * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

async function requestJson<T>(
  fetchImpl: typeof fetch,
  config: ReplayConfig,
  path: string,
  init: RequestInit,
): Promise<T> {
  const response = await fetchImpl(`${config.baseUrl}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
    signal: AbortSignal.timeout(config.requestTimeoutMs),
  });
  const text = await response.text();
  let body: unknown = {};
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = { raw: text };
    }
  }
  if (!response.ok) {
    throw new Error(`${init.method || "GET"} ${path} returned ${response.status}: ${JSON.stringify(body)}`);
  }
  return body as T;
}

function normalizeBaseUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`Invalid base URL: ${value}`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("base-url must use http or https");
  }
  return value.replace(/\/+$/, "");
}

function parseInteger(value: string, name: string): number {
  if (!/^-?\d+$/.test(value)) throw new Error(`${name} must be an integer`);
  return Number(value);
}

function parsePositiveInteger(value: string, name: string): number {
  const parsed = parseInteger(value, name);
  if (parsed <= 0) throw new Error(`${name} must be greater than zero`);
  return parsed;
}

function parsePositiveNumber(value: string, name: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`${name} must be greater than zero`);
  return parsed;
}

function parseSpeedMultiplier(value: string): ReplaySpeedMultiplier {
  const parsed = Number(value);
  if (!REPLAY_SPEED_MULTIPLIERS.includes(parsed as ReplaySpeedMultiplier)) {
    throw new Error("speed multiplier must be one of 1, 5, or 10");
  }
  return parsed as ReplaySpeedMultiplier;
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function formatReplayReport(stats: ReplayStats): string {
  return [
    `Route: ${stats.routeId}`,
    `Sessions: ${stats.sessionsCreated} created, ${stats.sessionsEnded} ended`,
    `Samples: ${stats.sentSamples} sent, ${stats.failedSamples} failed, ${stats.discardedSamples} client-discarded`,
    `Paused samples: ${stats.pausedSamples}`,
  ].join("\n");
}

function printUsage(): void {
  console.log(`Usage: bun run backend/scripts/demo-replay.ts [options]

Options:
  --base-url URL              API base URL (REPLAY_BASE_URL, default: ${DEFAULT_BASE_URL})
  --seed N                    deterministic seed (REPLAY_SEED, default: ${DEFAULT_SEED})
  --speed 1|5|10              wall-clock multiplier (REPLAY_SPEED_MULTIPLIER)
  --passengers 2|3            passengers in the small scenario (default: ${DEFAULT_PASSENGERS})
  --steps N                   samples per passenger (default: ${DEFAULT_STEPS})
  --interval-seconds N        simulated interval between samples (default: ${DEFAULT_INTERVAL_SECONDS})
`);
}

if (import.meta.main) {
  if (process.argv.includes("--help")) {
    printUsage();
  } else {
    try {
      const config = parseReplayConfig();
      console.log(`Starting HTTP demo replay at ${config.baseUrl} (${config.speedMultiplier}x, seed ${config.seed})`);
      const stats = await runReplay(config, { log: (message) => console.log(`[replay] ${message}`) });
      console.log(formatReplayReport(stats));
    } catch (error) {
      console.error(`Replay failed: ${formatError(error)}`);
      process.exitCode = 1;
    }
  }
}
