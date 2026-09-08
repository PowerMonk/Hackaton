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

// ============================================================================
// Multi-Vehicle ETA Selection
// ============================================================================

export interface VehicleCandidate {
  id: string;
  progress: number;
  speedKmh: number;
  speedHistoryKmh?: readonly number[];
  lastObservedAt: EtaTimestamp;
  state?: "moving" | "paused" | "dwelling" | "stopped";
  passengerCount?: number;
}

export interface BestVehicleEtaOptions extends EtaOptions {
  /** Consider next loop if all vehicles are past target */
  allowNextLoop?: boolean;
  /** Average stops per full route (for dwell calculation) */
  stopsPerRoute?: number;
  /** Minimum speed to consider vehicle as moving (km/h) */
  minMovingSpeedKmh?: number;
}

export interface BestVehicleEtaResult extends EtaEstimate {
  /** All candidates considered with their individual ETAs */
  allCandidates: Array<{
    vehicleId: string;
    eta: EtaEstimate;
    isNextLoop: boolean;
  }>;
  /** True if best ETA is from a vehicle completing a loop */
  isNextLoop: boolean;
}

/**
 * Selects the vehicle with the shortest ETA to reach target progress.
 *
 * Rules:
 * 1. Only considers vehicles BEFORE the target (progress < targetProgress)
 * 2. Prefers moving vehicles over paused/dwelling
 * 3. If all vehicles are past target and allowNextLoop=true, considers next loop
 * 4. Returns the candidate with minimum ETA
 */
export function selectBestVehicleEta(
  candidates: readonly VehicleCandidate[],
  targetProgress: number,
  routeLengthM: number,
  routeId: string,
  options: BestVehicleEtaOptions = {}
): BestVehicleEtaResult | null {
  if (candidates.length === 0) return null;

  const now = options.now ?? Date.now();
  const allowNextLoop = options.allowNextLoop ?? true;
  const stopsPerRoute = options.stopsPerRoute ?? 10;
  const minMovingSpeed = options.minMovingSpeedKmh ?? 3;
  const dwellPerStop = options.dwellSeconds ?? 20;

  const allCandidatesWithEta: Array<{
    vehicleId: string;
    eta: EtaEstimate;
    isNextLoop: boolean;
    isMoving: boolean;
  }> = [];

  // Calculate ETA for each candidate
  for (const candidate of candidates) {
    const isMoving = candidate.speedKmh >= minMovingSpeed &&
      candidate.state !== "paused" &&
      candidate.state !== "dwelling" &&
      candidate.state !== "stopped";

    // Check if vehicle is before target
    if (candidate.progress < targetProgress) {
      // Vehicle is approaching target - calculate direct ETA
      const stopsToPass = Math.round((targetProgress - candidate.progress) * stopsPerRoute);
      const totalDwellSeconds = stopsToPass * dwellPerStop;

      const eta = calculateEta({
        routeId,
        vehicleId: candidate.id,
        fromProgress: candidate.progress,
        targetProgress,
        routeLengthM,
        speedKmh: candidate.speedKmh,
        speedHistoryKmh: candidate.speedHistoryKmh,
        lastObservedAt: candidate.lastObservedAt,
      }, {
        ...options,
        now,
        dwellSeconds: totalDwellSeconds,
      });

      // Penalize paused/dwelling vehicles (they have 0 speed, so ETA would be huge)
      // Instead, use fallback speed but mark as lower confidence
      if (!isMoving && candidate.speedKmh < minMovingSpeed) {
        // Recalculate with fallback speed
        const adjustedEta = calculateEta({
          routeId,
          vehicleId: candidate.id,
          fromProgress: candidate.progress,
          targetProgress,
          routeLengthM,
          speedKmh: options.fallbackSpeedKmh ?? DEFAULT_ETA_OPTIONS.fallbackSpeedKmh,
          speedHistoryKmh: [],
          lastObservedAt: candidate.lastObservedAt,
        }, {
          ...options,
          now,
          dwellSeconds: totalDwellSeconds,
        });
        adjustedEta.confidence = "Baja";
        adjustedEta.label = `~${adjustedEta.minMinutes}-${adjustedEta.maxMinutes} min (pausado)`;

        allCandidatesWithEta.push({
          vehicleId: candidate.id,
          eta: adjustedEta,
          isNextLoop: false,
          isMoving: false,
        });
      } else {
        allCandidatesWithEta.push({
          vehicleId: candidate.id,
          eta,
          isNextLoop: false,
          isMoving,
        });
      }
    } else if (allowNextLoop) {
      // Vehicle is past target - calculate next loop ETA
      // Distance = (1 - current progress) + targetProgress (full loop)
      const loopProgress = (1 - candidate.progress) + targetProgress;
      const stopsToPass = Math.round(loopProgress * stopsPerRoute);
      const totalDwellSeconds = stopsToPass * dwellPerStop;

      const eta = calculateEta({
        routeId,
        vehicleId: candidate.id,
        fromProgress: 0,
        targetProgress: loopProgress,
        routeLengthM,
        speedKmh: candidate.speedKmh > minMovingSpeed ? candidate.speedKmh : (options.fallbackSpeedKmh ?? DEFAULT_ETA_OPTIONS.fallbackSpeedKmh),
        speedHistoryKmh: candidate.speedHistoryKmh,
        lastObservedAt: candidate.lastObservedAt,
      }, {
        ...options,
        now,
        dwellSeconds: totalDwellSeconds,
      });

      // Mark as next loop
      eta.label = `${eta.minMinutes}-${eta.maxMinutes} min (siguiente vuelta)`;
      eta.confidence = eta.confidence === "Alta" ? "Media" : "Baja";

      allCandidatesWithEta.push({
        vehicleId: candidate.id,
        eta,
        isNextLoop: true,
        isMoving,
      });
    }
  }

  if (allCandidatesWithEta.length === 0) return null;

  // Sort by:
  // 1. Prefer moving vehicles
  // 2. Prefer non-next-loop
  // 3. Minimum ETA
  allCandidatesWithEta.sort((a, b) => {
    // Moving vehicles first
    if (a.isMoving !== b.isMoving) return a.isMoving ? -1 : 1;
    // Non-next-loop first
    if (a.isNextLoop !== b.isNextLoop) return a.isNextLoop ? 1 : -1;
    // Then by minimum ETA
    return a.eta.minMinutes - b.eta.minMinutes;
  });

  const best = allCandidatesWithEta[0];

  return {
    ...best.eta,
    allCandidates: allCandidatesWithEta.map(c => ({
      vehicleId: c.vehicleId,
      eta: c.eta,
      isNextLoop: c.isNextLoop,
    })),
    isNextLoop: best.isNextLoop,
  };
}

/**
 * Calculates ETA to a stop, considering all vehicles on the route.
 * Returns the best (fastest) option.
 */
export function calculateStopEtaFromVehicles(
  vehicles: readonly VehicleCandidate[],
  stopProgress: number,
  routeLengthM: number,
  routeId: string,
  options: BestVehicleEtaOptions = {}
): BestVehicleEtaResult | null {
  return selectBestVehicleEta(vehicles, stopProgress, routeLengthM, routeId, options);
}

/**
 * Integration with mobility.ts:
 * 1. Resolve the stop's route progress and route totalLengthM in the existing
 *    SQL layer.
 * 2. Get all VirtualVehicles for the route
 * 3. Convert to VehicleCandidate[] and call selectBestVehicleEta
 * 4. Return BestVehicleEtaResult with all candidates considered
 */
