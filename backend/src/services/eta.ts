// Pure ETA calculation for a vehicle candidate and a target route progress.
// Route lookup, persistence, and stop lookup remain responsibilities of the
// caller (currently mobility.ts).

export type EtaTimestamp = Date | number;
export type EtaConfidence = "Alta" | "Media" | "Baja";

export interface EtaInput {
  routeId: string;
  vehicleId?: string | null;
  fromProgress: number;
  targetProgress: number;
  routeLengthM: number;
  speedKmh: number;
  /** Optional samples ordered from oldest to newest, excluding speedKmh. */
  speedHistoryKmh?: readonly number[];
  lastObservedAt: EtaTimestamp;
}

export interface EtaOptions {
  now?: EtaTimestamp;
  staleAfterSeconds?: number;
  dwellSeconds?: number;
  smoothingAlpha?: number;
  fallbackSpeedKmh?: number;
}

export interface EtaEstimate {
  minMinutes: number;
  maxMinutes: number;
  label: string;
  confidence: EtaConfidence;
  vehicleId: string | null;
  stale: boolean;
  calculatedAt: Date;
  remainingDistanceM: number;
  smoothedSpeedKmh: number;
  dwellMinutes: number;
}

export const DEFAULT_ETA_OPTIONS = {
  staleAfterSeconds: 90,
  dwellSeconds: 0,
  smoothingAlpha: 0.35,
  fallbackSpeedKmh: 15,
} as const;

/**
 * Exponential smoothing over oldest-to-newest speed samples. A higher alpha
 * reacts faster to traffic changes; the default keeps the current sample
 * meaningful without discarding recent history.
 */
export function smoothSpeedKmh(
  speedsKmh: readonly number[],
  alpha: number = DEFAULT_ETA_OPTIONS.smoothingAlpha
): number {
  const validSpeeds = speedsKmh.filter((speed) => Number.isFinite(speed) && speed >= 0);
  if (validSpeeds.length === 0) return 0;

  const boundedAlpha = Math.min(1, Math.max(0, alpha));
  return validSpeeds.slice(1).reduce(
    (smoothed, speed) => smoothed + boundedAlpha * (speed - smoothed),
    validSpeeds[0]
  );
}

export function remainingDistanceM(
  fromProgress: number,
  targetProgress: number,
  routeLengthM: number
): number {
  if (!Number.isFinite(routeLengthM) || routeLengthM <= 0) return 0;
  return Math.max(0, targetProgress - fromProgress) * routeLengthM;
}

/**
 * Calculates ETA while retaining a range instead of presenting false
 * precision. Dwell is added once for the target stop. A stale candidate still
 * produces a useful estimate, but is explicitly marked stale and receives a
 * wider range and Baja confidence.
 */
export function calculateEta(
  input: EtaInput,
  options: EtaOptions = {}
): EtaEstimate {
  const now = options.now ?? Date.now();
  const calculatedAt = new Date(toTimestampMs(now));
  const staleAfterSeconds = options.staleAfterSeconds ?? DEFAULT_ETA_OPTIONS.staleAfterSeconds;
  const ageSeconds = observationAgeSeconds(input.lastObservedAt, now);
  const stale = ageSeconds > staleAfterSeconds;

  const history = input.speedHistoryKmh ?? [];
  const speedSamples = [...history, input.speedKmh];
  const smoothedSpeed = smoothSpeedKmh(
    speedSamples,
    options.smoothingAlpha ?? DEFAULT_ETA_OPTIONS.smoothingAlpha
  );
  const fallbackSpeed = Math.max(
    0.1,
    options.fallbackSpeedKmh ?? DEFAULT_ETA_OPTIONS.fallbackSpeedKmh
  );
  const usableSpeed = smoothedSpeed > 0 ? smoothedSpeed : fallbackSpeed;
  const distanceM = remainingDistanceM(
    input.fromProgress,
    input.targetProgress,
    input.routeLengthM
  );
  const dwellMinutes = Math.max(0, options.dwellSeconds ?? DEFAULT_ETA_OPTIONS.dwellSeconds) / 60;
  const travelMinutes = distanceM / (usableSpeed * (1000 / 3600)) / 60;
  const baseMinutes = travelMinutes + dwellMinutes;
  const confidence = getConfidence(stale, speedSamples, ageSeconds, staleAfterSeconds);
  const uncertainty = uncertaintyFor(confidence, stale);
  const minMinutes = Math.max(0, Math.floor(baseMinutes * (1 - uncertainty)));
  const maxMinutes = Math.max(minMinutes, Math.ceil(baseMinutes * (1 + uncertainty)));

  return {
    minMinutes,
    maxMinutes,
    label: `${minMinutes}-${maxMinutes} min`,
    confidence,
    vehicleId: input.vehicleId ?? null,
    stale,
    calculatedAt,
    remainingDistanceM: distanceM,
    smoothedSpeedKmh: smoothedSpeed,
    dwellMinutes,
  };
}

function getConfidence(
  stale: boolean,
  speedSamples: readonly number[],
  ageSeconds: number,
  staleAfterSeconds: number
): EtaConfidence {
  if (stale) return "Baja";

  const validSamples = speedSamples.filter((speed) => Number.isFinite(speed) && speed > 0);
  if (validSamples.length === 0) return "Baja";
  if (validSamples.length >= 3 && ageSeconds <= staleAfterSeconds / 2) return "Alta";
  return "Media";
}

function uncertaintyFor(confidence: EtaConfidence, stale: boolean): number {
  if (stale) return 0.5;
  if (confidence === "Alta") return 0.15;
  if (confidence === "Media") return 0.25;
  return 0.35;
}

function observationAgeSeconds(observedAt: EtaTimestamp, now: EtaTimestamp): number {
  const observedAtMs = toTimestampMs(observedAt);
  const nowMs = toTimestampMs(now);
  if (!Number.isFinite(observedAtMs) || !Number.isFinite(nowMs)) return Infinity;
  return Math.max(0, (nowMs - observedAtMs) / 1000);
}

function toTimestampMs(timestamp: EtaTimestamp): number {
  if (timestamp instanceof Date) return timestamp.getTime();
  if (!Number.isFinite(timestamp)) return NaN;
  return Math.abs(timestamp) < 10_000_000_000 ? timestamp * 1000 : timestamp;
}

/**
 * Integration with mobility.ts:
 * 1. Resolve the stop's route progress and route totalLengthM in the existing
 *    SQL layer.
 * 2. Convert a VehicleCluster (or VirtualVehicle) to EtaInput, passing its
 *    recent speeds as speedHistoryKmh and using one request timestamp.
 * 3. Call calculateEta with the configured stop dwell time.
 * 4. Return EtaEstimate directly: its core fields are structurally compatible
 *    with EtaResult; persistence and HTTP mapping stay outside this module.
 */
