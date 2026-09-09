// Pure, provisional route planner for the current OSM-derived dataset.
//
// This module intentionally does not import PostGIS, HTTP clients, clocks, or
// application-wide types. A future GTFS adapter can normalize its stops and
// routes into PlannerDataset without changing the planning algorithm.

export type PlannerPriority =
  | "fastest"
  | "cheapest"
  | "least_walking"
  | "fewest_transfers";

export type PlannerMode = "walk" | "transit";
export type PlannerConfidence = "low" | "medium" | "high";

export interface PlannerCoordinates {
  lat: number;
  lon: number;
}

export interface PlannerPlace extends PlannerCoordinates {
  label: string;
}

/** Normalized stop shape. routeProgress is optional GTFS/PostGIS metadata. */
export interface PlannerStop {
  id: string;
  name?: string | null;
  coordinates: PlannerCoordinates;
  routeIds?: readonly string[];
  routeProgress?: Readonly<Record<string, number>>;
}

/**
 * A route may provide stopIds in stop_times order when GTFS is available.
 * Current OSM data can use routeIds on stops and leave stopIds absent.
 */
export interface PlannerRoute {
  id: string;
  name: string;
  ref?: string;
  mode?: string;
  color?: string;
  stopIds?: readonly string[];
  fare?: number;
}

export interface PlannerCoverage {
  source: string;
  knownStops: number;
  complete: boolean;
}

export interface PlannerDataset {
  stops: readonly PlannerStop[];
  routes: readonly PlannerRoute[];
  coverage?: PlannerCoverage;
}

export interface PlannerConfig {
  walkingSpeedKmh: number;
  walkingDistanceFactor: number;
  transitSpeedKmh: number;
  defaultTransitFare: number;
  nearbyStopRadiusMeters: number;
  maxNearbyStops: number;
  maxPlans: number;
  fallbackToWalking: boolean;
}

export interface PlannerRequest {
  origin: PlannerPlace;
  destination: PlannerPlace;
  priority?: PlannerPriority;
  modes?: readonly PlannerMode[];
  config?: Partial<PlannerConfig>;
}

export interface PlannerStopCandidate {
  stopId: string;
  name: string;
  distanceMeters: number;
}

export interface PlannerLeg {
  mode: PlannerMode;
  from: PlannerPlace;
  to: PlannerPlace;
  distanceMeters: number;
  durationSeconds: number;
  routeId?: string;
  routeName?: string;
  routeColor?: string;
  instructions: string;
}

export interface PlannerPlan {
  id: string;
  legs: readonly PlannerLeg[];
  totalDistanceMeters: number;
  totalDurationSeconds: number;
  totalWalkingMeters: number;
  transfers: number;
  estimatedCost: number;
  routeIds: readonly string[];
  confidence: PlannerConfidence;
  provisional: true;
  isFallback: boolean;
}

export interface PlannerMetadata {
  source: string;
  provisional: true;
  confidence: PlannerConfidence;
  officialSchedulesAvailable: false;
  estimatedFares: true;
  walkingDistanceFactor: number;
  candidates: {
    origin: readonly PlannerStopCandidate[];
    destination: readonly PlannerStopCandidate[];
  };
  stopCoverage: PlannerCoverage;
  fallbackUsed: boolean;
  warnings: readonly string[];
  assumptions: readonly string[];
}

export interface PlannerResult {
  recommended: PlannerPlan | null;
  plans: readonly PlannerPlan[];
  alternatives: readonly PlannerPlan[];
  metadata: PlannerMetadata;
}

export const DEFAULT_PLANNER_CONFIG: Readonly<PlannerConfig> = {
  walkingSpeedKmh: 5,
  walkingDistanceFactor: 1.25,
  transitSpeedKmh: 20,
  defaultTransitFare: 12,
  // 1000m gives ~13 min walk to a stop. Stops are ~400m apart (synthetic),
  // but route ends and gaps push the nearest stop beyond 800m in places.
  nearbyStopRadiusMeters: 1000,
  maxNearbyStops: 6,
  maxPlans: 3,
  fallbackToWalking: true,
};

/** Haversine great-circle distance in meters. */
export function haversineDistanceMeters(
  from: PlannerCoordinates,
  to: PlannerCoordinates
): number {
  const earthRadiusMeters = 6_371_000;
  const dLat = degreesToRadians(to.lat - from.lat);
  const dLon = degreesToRadians(to.lon - from.lon);
  const latitude1 = degreesToRadians(from.lat);
  const latitude2 = degreesToRadians(to.lat);
  const sinLat = Math.sin(dLat / 2);
  const sinLon = Math.sin(dLon / 2);
  const a =
    sinLat * sinLat +
    Math.cos(latitude1) * Math.cos(latitude2) * sinLon * sinLon;

  return earthRadiusMeters * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Plans direct transit alternatives and a full-walk alternative using only
 * deterministic local data. No arrival time or official timetable is inferred.
 */
export function planProvisionalRoutes(
  request: PlannerRequest,
  dataset: PlannerDataset
): PlannerResult {
  validatePlace(request.origin, "origin");
  validatePlace(request.destination, "destination");

  const config = normalizeConfig(request.config);
  const priority = request.priority ?? "fastest";
  const modes = new Set(request.modes ?? ["walk", "transit"]);
  const coverage = dataset.coverage ?? {
    source: "provisional",
    knownStops: dataset.stops.length,
    complete: false,
  };
  const originCandidates = findNearbyStops(
    request.origin,
    dataset.stops,
    config
  );
  const destinationCandidates = findNearbyStops(
    request.destination,
    dataset.stops,
    config
  );

  const warnings: string[] = [];
  if (!coverage.complete) {
    warnings.push(
      `La fuente ${coverage.source} solo declara ${coverage.knownStops} paradas; la cobertura es incompleta.`
    );
  }
  warnings.push(
    "No hay horarios oficiales: la duracion de transporte excluye espera y es aproximada."
  );
  if (config.walkingDistanceFactor !== 1) {
    warnings.push(
      `La caminata usa distancia Haversine multiplicada por ${config.walkingDistanceFactor}.`
    );
  }

  const assumptions = [
    "Las rutas de transporte son conexiones directas entre paradas compartidas.",
    "La velocidad de transporte es una media configurable, no un horario oficial.",
    "La tarifa es un estimado configurable y no representa cobro real.",
  ];
  const plans: PlannerPlan[] = [];

  if (modes.has("walk")) {
    plans.push(
      buildWalkingPlan(
        request.origin,
        request.destination,
        config,
        false
      )
    );
  }

  if (modes.has("transit")) {
    // First, find direct routes (no transfers)
    const directPlans = buildDirectTransitPlans(
      request,
      dataset,
      originCandidates,
      destinationCandidates,
      config
    );
    plans.push(...directPlans);

    // If no direct routes found, try one-transfer routes
    if (directPlans.length === 0) {
      const transferPlans = buildTransferTransitPlans(
        request,
        dataset,
        originCandidates,
        destinationCandidates,
        config
      );
      plans.push(...transferPlans);
    }
  }

  const hasTransitPlan = plans.some((plan) => plan.routeIds.length > 0);
  const fallbackUsed =
    modes.has("transit") && !hasTransitPlan && config.fallbackToWalking;
  if (fallbackUsed) {
    const directWalkIndex = plans.findIndex((plan) => plan.id === "walk-direct");
    const fallbackPlan = buildWalkingPlan(
      request.origin,
      request.destination,
      config,
      true
    );
    if (directWalkIndex >= 0) {
      plans[directWalkIndex] = fallbackPlan;
    } else {
      plans.push(fallbackPlan);
    }
    warnings.push(
      "No se encontro una ruta directa con las paradas disponibles; se uso caminata completa."
    );
  } else if (modes.has("transit") && !hasTransitPlan) {
    warnings.push(
      "No se encontro una ruta directa con las paradas disponibles; la caminata es la unica alternativa."
    );
  }

  const uniquePlans = deduplicatePlans(plans);
  const sortedPlans = uniquePlans.sort((left, right) =>
    comparePlans(left, right, priority)
  );
  const selectedPlans = sortedPlans.slice(0, config.maxPlans);
  const metadata: PlannerMetadata = {
    source: coverage.source,
    provisional: true,
    confidence: "low",
    officialSchedulesAvailable: false,
    estimatedFares: true,
    walkingDistanceFactor: config.walkingDistanceFactor,
    candidates: {
      origin: originCandidates,
      destination: destinationCandidates,
    },
    stopCoverage: coverage,
    fallbackUsed,
    warnings,
    assumptions,
  };

  return {
    recommended: selectedPlans[0] ?? null,
    plans: selectedPlans,
    alternatives: selectedPlans.slice(1),
    metadata,
  };
}

function buildDirectTransitPlans(
  request: PlannerRequest,
  dataset: PlannerDataset,
  originCandidates: readonly PlannerStopCandidate[],
  destinationCandidates: readonly PlannerStopCandidate[],
  config: PlannerConfig
): PlannerPlan[] {
  const stopsById = new Map(dataset.stops.map((stop) => [stop.id, stop]));
  const plans: PlannerPlan[] = [];

  for (const route of dataset.routes) {
    const originOptions = originCandidates
      .map((candidate) => stopsById.get(candidate.stopId))
      .filter((stop): stop is PlannerStop => stop !== undefined)
      .filter((stop) => routeServesStop(route, stop));
    const destinationOptions = destinationCandidates
      .map((candidate) => stopsById.get(candidate.stopId))
      .filter((stop): stop is PlannerStop => stop !== undefined)
      .filter((stop) => routeServesStop(route, stop));

    const pair = chooseStopPair(
      route,
      request.origin,
      request.destination,
      originOptions,
      destinationOptions
    );
    if (!pair) continue;

    plans.push(
      buildTransitPlan(
        request.origin,
        request.destination,
        route,
        pair.origin,
        pair.destination,
        config
      )
    );
  }

  return plans;
}

/**
 * Build transit plans with one transfer.
 * Finds routes where user takes route A to a transfer stop, then route B to destination.
 */
function buildTransferTransitPlans(
  request: PlannerRequest,
  dataset: PlannerDataset,
  originCandidates: readonly PlannerStopCandidate[],
  destinationCandidates: readonly PlannerStopCandidate[],
  config: PlannerConfig
): PlannerPlan[] {
  const stopsById = new Map(dataset.stops.map((stop) => [stop.id, stop]));
  const plans: PlannerPlan[] = [];
  const maxTransferPlans = 3;

  // Build a map of route -> stops it serves
  const routeStops = new Map<string, Set<string>>();
  for (const stop of dataset.stops) {
    for (const routeId of stop.routeIds ?? []) {
      if (!routeStops.has(routeId)) {
        routeStops.set(routeId, new Set());
      }
      routeStops.get(routeId)!.add(stop.id);
    }
  }

  // Find routes serving origin stops
  const originRoutes = new Map<string, PlannerStop>();
  for (const candidate of originCandidates) {
    const stop = stopsById.get(candidate.stopId);
    if (!stop) continue;
    for (const routeId of stop.routeIds ?? []) {
      if (!originRoutes.has(routeId)) {
        originRoutes.set(routeId, stop);
      }
    }
  }

  // Find routes serving destination stops
  const destRoutes = new Map<string, PlannerStop>();
  for (const candidate of destinationCandidates) {
    const stop = stopsById.get(candidate.stopId);
    if (!stop) continue;
    for (const routeId of stop.routeIds ?? []) {
      if (!destRoutes.has(routeId)) {
        destRoutes.set(routeId, stop);
      }
    }
  }

  // Find transfer points: stops served by both an origin route and a dest route
  const transferCandidates: Array<{
    transferStop: PlannerStop;
    route1Id: string;
    route2Id: string;
    originStop: PlannerStop;
    destStop: PlannerStop;
    score: number;
  }> = [];

  for (const [route1Id, originStop] of originRoutes) {
    const route1Stops = routeStops.get(route1Id);
    if (!route1Stops) continue;

    for (const [route2Id, destStop] of destRoutes) {
      if (route1Id === route2Id) continue; // Skip same route (handled by direct)

      const route2Stops = routeStops.get(route2Id);
      if (!route2Stops) continue;

      // Find common stops (transfer points)
      for (const transferStopId of route1Stops) {
        if (route2Stops.has(transferStopId)) {
          const transferStop = stopsById.get(transferStopId);
          if (!transferStop) continue;

          // Calculate score based on total walking + transit distance
          const score =
            haversineDistanceMeters(request.origin, originStop.coordinates) +
            haversineDistanceMeters(originStop.coordinates, transferStop.coordinates) +
            haversineDistanceMeters(transferStop.coordinates, destStop.coordinates) +
            haversineDistanceMeters(destStop.coordinates, request.destination);

          transferCandidates.push({
            transferStop,
            route1Id,
            route2Id,
            originStop,
            destStop,
            score,
          });
        }
      }
    }
  }

  // Sort by score and take best candidates
  transferCandidates.sort((a, b) => a.score - b.score);

  for (const candidate of transferCandidates.slice(0, maxTransferPlans)) {
    const route1 = dataset.routes.find((r) => r.id === candidate.route1Id);
    const route2 = dataset.routes.find((r) => r.id === candidate.route2Id);
    if (!route1 || !route2) continue;

    const plan = buildTransferPlan(
      request.origin,
      request.destination,
      route1,
      route2,
      candidate.originStop,
      candidate.transferStop,
      candidate.destStop,
      config
    );
    plans.push(plan);
  }

  return plans;
}

function buildTransferPlan(
  origin: PlannerPlace,
  destination: PlannerPlace,
  route1: PlannerRoute,
  route2: PlannerRoute,
  originStop: PlannerStop,
  transferStop: PlannerStop,
  destStop: PlannerStop,
  config: PlannerConfig
): PlannerPlan {
  const walkToStop = approximateWalkingDistance(origin, originStop.coordinates, config);
  const transit1Distance = haversineDistanceMeters(originStop.coordinates, transferStop.coordinates);
  const transit2Distance = haversineDistanceMeters(transferStop.coordinates, destStop.coordinates);
  const walkFromStop = approximateWalkingDistance(destStop.coordinates, destination, config);

  const walkToStopDuration = walkingDurationSeconds(walkToStop, config);
  const transit1Duration = Math.max(0, Math.round(transit1Distance / (config.transitSpeedKmh / 3.6)));
  const transit2Duration = Math.max(0, Math.round(transit2Distance / (config.transitSpeedKmh / 3.6)));
  const walkFromStopDuration = walkingDurationSeconds(walkFromStop, config);

  // Add 3 min transfer time
  const transferTime = 180;

  const route1Label = route1.name || route1.ref || route1.id;
  const route2Label = route2.name || route2.ref || route2.id;

  const legs: PlannerLeg[] = [
    {
      mode: "walk",
      from: origin,
      to: placeFromStop(originStop),
      distanceMeters: walkToStop,
      durationSeconds: walkToStopDuration,
      instructions: `Camina hacia ${stopLabel(originStop)}`,
    },
    {
      mode: "transit",
      from: placeFromStop(originStop),
      to: placeFromStop(transferStop),
      distanceMeters: Math.round(transit1Distance),
      durationSeconds: transit1Duration,
      routeId: route1.id,
      routeName: route1Label,
      routeColor: route1.color,
      instructions: `Toma ${route1Label} hacia ${stopLabel(transferStop)}`,
    },
    {
      mode: "transit",
      from: placeFromStop(transferStop),
      to: placeFromStop(destStop),
      distanceMeters: Math.round(transit2Distance),
      durationSeconds: transit2Duration + transferTime,
      routeId: route2.id,
      routeName: route2Label,
      routeColor: route2.color,
      instructions: `Transbordo: toma ${route2Label} hacia ${stopLabel(destStop)}`,
    },
    {
      mode: "walk",
      from: placeFromStop(destStop),
      to: destination,
      distanceMeters: walkFromStop,
      durationSeconds: walkFromStopDuration,
      instructions: `Camina hacia ${destination.label}`,
    },
  ];

  const totalCost = positiveOrZero(route1.fare, config.defaultTransitFare) +
                    positiveOrZero(route2.fare, config.defaultTransitFare);

  return {
    id: `transfer-${route1.id}-${route2.id}`,
    legs,
    totalDistanceMeters: Math.round(walkToStop + transit1Distance + transit2Distance + walkFromStop),
    totalDurationSeconds: walkToStopDuration + transit1Duration + transferTime + transit2Duration + walkFromStopDuration,
    totalWalkingMeters: Math.round(walkToStop + walkFromStop),
    transfers: 1,
    estimatedCost: totalCost,
    routeIds: [route1.id, route2.id],
    confidence: "low",
    provisional: true,
    isFallback: false,
  };
}

function buildWalkingPlan(
  origin: PlannerPlace,
  destination: PlannerPlace,
  config: PlannerConfig,
  isFallback: boolean
): PlannerPlan {
  const distanceMeters = approximateWalkingDistance(origin, destination, config);
  const durationSeconds = walkingDurationSeconds(distanceMeters, config);

  return {
    id: isFallback ? "walk-fallback" : "walk-direct",
    legs: [
      {
        mode: "walk",
        from: origin,
        to: destination,
        distanceMeters,
        durationSeconds,
        instructions: `Camina hacia ${destination.label}`,
      },
    ],
    totalDistanceMeters: distanceMeters,
    totalDurationSeconds: durationSeconds,
    totalWalkingMeters: distanceMeters,
    transfers: 0,
    estimatedCost: 0,
    routeIds: [],
    confidence: "low",
    provisional: true,
    isFallback,
  };
}

function buildTransitPlan(
  origin: PlannerPlace,
  destination: PlannerPlace,
  route: PlannerRoute,
  originStop: PlannerStop,
  destinationStop: PlannerStop,
  config: PlannerConfig
): PlannerPlan {
  const walkToStop = approximateWalkingDistance(
    origin,
    originStop.coordinates,
    config
  );
  const transitDistance = haversineDistanceMeters(
    originStop.coordinates,
    destinationStop.coordinates
  );
  const walkFromStop = approximateWalkingDistance(
    destinationStop.coordinates,
    destination,
    config
  );
  const walkToStopDuration = walkingDurationSeconds(walkToStop, config);
  const transitDuration = Math.max(
    0,
    Math.round(transitDistance / (config.transitSpeedKmh / 3.6))
  );
  const walkFromStopDuration = walkingDurationSeconds(walkFromStop, config);
  const routeLabel = route.name || route.ref || route.id;
  const originStopLabel = stopLabel(originStop);
  const destinationStopLabel = stopLabel(destinationStop);

  const legs: PlannerLeg[] = [
    {
      mode: "walk",
      from: origin,
      to: placeFromStop(originStop),
      distanceMeters: walkToStop,
      durationSeconds: walkToStopDuration,
      instructions: `Camina hacia ${originStopLabel}`,
    },
    {
      mode: "transit",
      from: placeFromStop(originStop),
      to: placeFromStop(destinationStop),
      distanceMeters: Math.round(transitDistance),
      durationSeconds: transitDuration,
      routeId: route.id,
      routeName: routeLabel,
      routeColor: route.color,
      instructions: `Toma ${routeLabel} hacia ${destinationStopLabel}`,
    },
    {
      mode: "walk",
      from: placeFromStop(destinationStop),
      to: destination,
      distanceMeters: walkFromStop,
      durationSeconds: walkFromStopDuration,
      instructions: `Camina hacia ${destination.label}`,
    },
  ];

  return {
    id: `transit-${route.id}`,
    legs,
    totalDistanceMeters: Math.round(
      walkToStop + transitDistance + walkFromStop
    ),
    totalDurationSeconds:
      walkToStopDuration + transitDuration + walkFromStopDuration,
    totalWalkingMeters: Math.round(walkToStop + walkFromStop),
    transfers: 0,
    estimatedCost: positiveOrZero(route.fare, config.defaultTransitFare),
    routeIds: [route.id],
    confidence: "low",
    provisional: true,
    isFallback: false,
  };
}

function findNearbyStops(
  place: PlannerPlace,
  stops: readonly PlannerStop[],
  config: PlannerConfig
): PlannerStopCandidate[] {
  return stops
    .map((stop) => {
      const rawDistanceMeters = haversineDistanceMeters(
        place,
        stop.coordinates
      );
      return {
        stopId: stop.id,
        name: stopLabel(stop),
        rawDistanceMeters,
        distanceMeters: Math.round(rawDistanceMeters),
      };
    })
    .filter(
      (candidate) => candidate.rawDistanceMeters <= config.nearbyStopRadiusMeters
    )
    .sort(
      (left, right) =>
        left.distanceMeters - right.distanceMeters ||
        left.stopId.localeCompare(right.stopId)
    )
    .map(({ rawDistanceMeters: _rawDistanceMeters, ...candidate }) => candidate)
    .slice(0, config.maxNearbyStops);
}

function chooseStopPair(
  route: PlannerRoute,
  originPlace: PlannerPlace,
  destinationPlace: PlannerPlace,
  originOptions: readonly PlannerStop[],
  destinationOptions: readonly PlannerStop[]
): { origin: PlannerStop; destination: PlannerStop } | null {
  const pairs: Array<{
    origin: PlannerStop;
    destination: PlannerStop;
    score: number;
  }> = [];

  for (const originStop of originOptions) {
    for (const destinationStop of destinationOptions) {
      if (originStop.id === destinationStop.id) continue;
      const originIndex = route.stopIds?.indexOf(originStop.id) ?? -1;
      const destinationIndex =
        route.stopIds?.indexOf(destinationStop.id) ?? -1;

      // If stop_times order is known, do not invent a reverse-direction trip.
      if (
        originIndex >= 0 &&
        destinationIndex >= 0 &&
        destinationIndex <= originIndex
      ) {
        continue;
      }

      pairs.push({
        origin: originStop,
        destination: destinationStop,
        score:
          haversineDistanceMeters(
            originStop.coordinates,
            destinationStop.coordinates
          ) +
          haversineDistanceMeters(originPlace, originStop.coordinates) +
          haversineDistanceMeters(destinationStop.coordinates, destinationPlace),
      });
    }
  }

  pairs.sort(
    (left, right) =>
      left.score - right.score ||
      left.origin.id.localeCompare(right.origin.id) ||
      left.destination.id.localeCompare(right.destination.id)
  );
  const pair = pairs[0];
  return pair ? { origin: pair.origin, destination: pair.destination } : null;
}

function routeServesStop(route: PlannerRoute, stop: PlannerStop): boolean {
  return (
    route.stopIds?.includes(stop.id) === true ||
    stop.routeIds?.includes(route.id) === true
  );
}

function comparePlans(
  left: PlannerPlan,
  right: PlannerPlan,
  priority: PlannerPriority
): number {
  const leftValues = rankingValues(left, priority);
  const rightValues = rankingValues(right, priority);
  for (let index = 0; index < leftValues.length; index++) {
    if (leftValues[index] !== rightValues[index]) {
      return leftValues[index] - rightValues[index];
    }
  }
  return left.id.localeCompare(right.id);
}

function rankingValues(
  plan: PlannerPlan,
  priority: PlannerPriority
): number[] {
  switch (priority) {
    case "cheapest":
      return [
        plan.estimatedCost,
        plan.totalDurationSeconds,
        plan.totalWalkingMeters,
        plan.transfers,
      ];
    case "least_walking":
      return [
        plan.totalWalkingMeters,
        plan.totalDurationSeconds,
        plan.transfers,
        plan.estimatedCost,
      ];
    case "fewest_transfers":
      return [
        plan.transfers,
        plan.totalDurationSeconds,
        plan.totalWalkingMeters,
        plan.estimatedCost,
      ];
    case "fastest":
    default:
      return [
        plan.totalDurationSeconds,
        plan.totalWalkingMeters,
        plan.transfers,
        plan.estimatedCost,
      ];
  }
}

function deduplicatePlans(plans: readonly PlannerPlan[]): PlannerPlan[] {
  const seen = new Set<string>();
  return plans.filter((plan) => {
    if (seen.has(plan.id)) return false;
    seen.add(plan.id);
    return true;
  });
}

function approximateWalkingDistance(
  from: PlannerCoordinates,
  to: PlannerCoordinates,
  config: PlannerConfig
): number {
  return Math.round(
    haversineDistanceMeters(from, to) * config.walkingDistanceFactor
  );
}

function walkingDurationSeconds(
  distanceMeters: number,
  config: PlannerConfig
): number {
  return Math.max(
    0,
    Math.round(distanceMeters / (config.walkingSpeedKmh / 3.6))
  );
}

function placeFromStop(stop: PlannerStop): PlannerPlace {
  return {
    ...stop.coordinates,
    label: stopLabel(stop),
  };
}

function stopLabel(stop: PlannerStop): string {
  return stop.name?.trim() || "Parada sin nombre";
}

function normalizeConfig(
  partial: Partial<PlannerConfig> | undefined
): PlannerConfig {
  const config = { ...DEFAULT_PLANNER_CONFIG, ...partial };
  return {
    walkingSpeedKmh: positiveOrDefault(config.walkingSpeedKmh, 5),
    walkingDistanceFactor: positiveOrDefault(
      config.walkingDistanceFactor,
      1.25
    ),
    transitSpeedKmh: positiveOrDefault(config.transitSpeedKmh, 20),
    defaultTransitFare: nonNegativeOrDefault(config.defaultTransitFare, 12),
    nearbyStopRadiusMeters: positiveOrDefault(
      config.nearbyStopRadiusMeters,
      800
    ),
    maxNearbyStops: positiveIntegerOrDefault(config.maxNearbyStops, 5),
    maxPlans: positiveIntegerOrDefault(config.maxPlans, 3),
    fallbackToWalking: config.fallbackToWalking !== false,
  };
}

function validatePlace(place: PlannerPlace, field: string): void {
  if (
    !place ||
    !Number.isFinite(place.lat) ||
    !Number.isFinite(place.lon) ||
    typeof place.label !== "string"
  ) {
    throw new RangeError(`${field} must contain finite lat/lon coordinates.`);
  }
}

function positiveOrDefault(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function nonNegativeOrDefault(value: number, fallback: number): number {
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

function positiveIntegerOrDefault(value: number, fallback: number): number {
  return Number.isFinite(value) && value >= 1 ? Math.floor(value) : fallback;
}

function positiveOrZero(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isFinite(value) && value >= 0
    ? value
    : fallback;
}

function degreesToRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}
