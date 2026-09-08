// Pure grouping helpers for turning passenger/session observations into
// virtual vehicle candidates. No database or route-service dependency lives
// here so the same rules can be used by the live and demo paths.

export type ObservationTimestamp = Date | number;

export interface VehicleObservation {
  id?: string;
  sessionId?: string;
  routeId: string;
  progress: number;
  speedKmh: number;
  heading?: number | null;
  observedAt: ObservationTimestamp;
  routeLengthM: number;
}

export interface VehicleClusteringOptions {
  now?: ObservationTimestamp;
  maxAgeSeconds?: number;
  distanceToleranceM?: number;
  speedToleranceKmh?: number;
  headingToleranceDegrees?: number;
}

export interface VehicleCluster {
  routeId: string;
  observations: VehicleObservation[];
  progress: number;
  speedKmh: number;
  heading: number | null;
  lastObservedAt: Date;
  distanceSpreadM: number;
}

export const DEFAULT_CLUSTERING_OPTIONS = {
  maxAgeSeconds: 90,
  distanceToleranceM: 125,
  speedToleranceKmh: 10,
  headingToleranceDegrees: 45,
} as const;

/**
 * Returns the age of a sample in seconds. Numeric timestamps support both
 * JavaScript milliseconds and Unix seconds, matching LocationSample input.
 */
export function observationAgeSeconds(
  observedAt: ObservationTimestamp,
  now: ObservationTimestamp = Date.now()
): number {
  const observedAtMs = toTimestampMs(observedAt);
  const nowMs = toTimestampMs(now);
  if (!Number.isFinite(observedAtMs) || !Number.isFinite(nowMs)) return Infinity;
  return Math.max(0, (nowMs - observedAtMs) / 1000);
}

export function isObservationFresh(
  observation: VehicleObservation,
  now: ObservationTimestamp = Date.now(),
  maxAgeSeconds: number = DEFAULT_CLUSTERING_OPTIONS.maxAgeSeconds
): boolean {
  return observationAgeSeconds(observation.observedAt, now) <= maxAgeSeconds;
}

export function areObservationsCompatible(
  left: VehicleObservation,
  right: VehicleObservation,
  options: Pick<
    VehicleClusteringOptions,
    "distanceToleranceM" | "speedToleranceKmh" | "headingToleranceDegrees"
  > = DEFAULT_CLUSTERING_OPTIONS
): boolean {
  if (left.routeId !== right.routeId) return false;

  const distanceM = progressDistanceM(left, right);
  const speedDifference = Math.abs(left.speedKmh - right.speedKmh);
  const headingCompatible = headingsCompatible(
    left.heading,
    right.heading,
    options.headingToleranceDegrees ?? DEFAULT_CLUSTERING_OPTIONS.headingToleranceDegrees
  );

  return (
    distanceM <= (options.distanceToleranceM ?? DEFAULT_CLUSTERING_OPTIONS.distanceToleranceM) &&
    speedDifference <= (options.speedToleranceKmh ?? DEFAULT_CLUSTERING_OPTIONS.speedToleranceKmh) &&
    headingCompatible
  );
}

/**
 * Groups only fresh observations. A candidate must be compatible with every
 * member already in a cluster, so an incompatible chain cannot merge two
 * vehicles merely because each endpoint matches a different middle sample.
 * Input order is preserved for deterministic results.
 */
export function clusterVehicleObservations(
  observations: readonly VehicleObservation[],
  options: VehicleClusteringOptions = {}
): VehicleCluster[] {
  const now = options.now ?? Date.now();
  const maxAgeSeconds = options.maxAgeSeconds ?? DEFAULT_CLUSTERING_OPTIONS.maxAgeSeconds;
  const compatibilityOptions = {
    distanceToleranceM:
      options.distanceToleranceM ?? DEFAULT_CLUSTERING_OPTIONS.distanceToleranceM,
    speedToleranceKmh:
      options.speedToleranceKmh ?? DEFAULT_CLUSTERING_OPTIONS.speedToleranceKmh,
    headingToleranceDegrees:
      options.headingToleranceDegrees ?? DEFAULT_CLUSTERING_OPTIONS.headingToleranceDegrees,
  };

  const clusters: VehicleObservation[][] = [];

  for (const observation of observations) {
    if (!isValidObservation(observation) || !isObservationFresh(observation, now, maxAgeSeconds)) {
      continue;
    }

    const existingCluster = clusters.find((cluster) =>
      cluster.every((member) => areObservationsCompatible(member, observation, compatibilityOptions))
    );

    if (existingCluster) {
      existingCluster.push(observation);
    } else {
      clusters.push([observation]);
    }
  }

  return clusters.map(toVehicleCluster);
}

function toVehicleCluster(observations: VehicleObservation[]): VehicleCluster {
  const routeId = observations[0].routeId;
  const progress = average(observations.map((observation) => observation.progress));
  const speedKmh = average(observations.map((observation) => observation.speedKmh));
  const headings = observations
    .map((observation) => observation.heading)
    .filter((heading): heading is number => heading !== null && heading !== undefined && Number.isFinite(heading));
  const observedAt = observations.map((observation) => toTimestampMs(observation.observedAt));
  const distanceSpreadM = maxPairwiseDistanceM(observations);

  return {
    routeId,
    observations: [...observations],
    progress,
    speedKmh,
    heading: headings.length > 0 ? circularMean(headings) : null,
    lastObservedAt: new Date(Math.max(...observedAt)),
    distanceSpreadM,
  };
}

function isValidObservation(observation: VehicleObservation): boolean {
  return (
    observation.routeId.length > 0 &&
    Number.isFinite(observation.progress) &&
    observation.progress >= 0 &&
    observation.progress <= 1 &&
    Number.isFinite(observation.speedKmh) &&
    observation.speedKmh >= 0 &&
    Number.isFinite(observation.routeLengthM) &&
    observation.routeLengthM > 0
  );
}

function progressDistanceM(left: VehicleObservation, right: VehicleObservation): number {
  // Averaging lengths keeps the comparison stable if route metadata was
  // refreshed between two samples.
  const routeLengthM = (left.routeLengthM + right.routeLengthM) / 2;
  return Math.abs(left.progress - right.progress) * routeLengthM;
}

function maxPairwiseDistanceM(observations: VehicleObservation[]): number {
  let maximum = 0;
  for (let leftIndex = 0; leftIndex < observations.length; leftIndex++) {
    for (let rightIndex = leftIndex + 1; rightIndex < observations.length; rightIndex++) {
      maximum = Math.max(
        maximum,
        progressDistanceM(observations[leftIndex], observations[rightIndex])
      );
    }
  }
  return maximum;
}

function headingsCompatible(
  left: number | null | undefined,
  right: number | null | undefined,
  toleranceDegrees: number
): boolean {
  // A missing heading is not evidence that two otherwise matching samples
  // belong to different vehicles.
  if (left === null || left === undefined || right === null || right === undefined) {
    return true;
  }
  if (!Number.isFinite(left) || !Number.isFinite(right)) return false;

  return circularDifference(left, right) <= toleranceDegrees;
}

function circularDifference(left: number, right: number): number {
  const difference = Math.abs(normalizeHeading(left) - normalizeHeading(right));
  return Math.min(difference, 360 - difference);
}

function circularMean(headings: number[]): number {
  let sinSum = 0;
  let cosSum = 0;
  for (const heading of headings) {
    const radians = (normalizeHeading(heading) * Math.PI) / 180;
    sinSum += Math.sin(radians);
    cosSum += Math.cos(radians);
  }
  return normalizeHeading((Math.atan2(sinSum, cosSum) * 180) / Math.PI);
}

function normalizeHeading(heading: number): number {
  return ((heading % 360) + 360) % 360;
}

function average(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function toTimestampMs(timestamp: ObservationTimestamp): number {
  if (timestamp instanceof Date) return timestamp.getTime();
  if (!Number.isFinite(timestamp)) return NaN;
  return Math.abs(timestamp) < 10_000_000_000 ? timestamp * 1000 : timestamp;
}

/**
 * Integration with mobility.ts:
 * 1. Read active sessions/samples and join each route's totalLengthM.
 * 2. Map currentProgress/currentSpeed/lastSampleAt (and latest heading) to
 *    VehicleObservation; keep the session id in sessionId.
 * 3. Call clusterVehicleObservations with one shared `now` per request.
 * 4. Persist or publish each returned VehicleCluster as the virtual vehicle
 *    candidate. This service deliberately does not perform that I/O.
 */
