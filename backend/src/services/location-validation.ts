import type { LocationSample } from "../types";

export const DEFAULT_ACCURACY_METERS = 10;
export const MAX_ACCURACY_METERS = 1_000;
export const MAX_SPEED_MPS = 70;
export const MAX_TIMESTAMP_AGE_MS = 24 * 60 * 60 * 1_000;
export const MAX_TIMESTAMP_FUTURE_MS = 5 * 60 * 1_000;

export type LocationValidationResult =
  | { valid: true; sample: LocationSample; errors: [] }
  | { valid: false; sample: null; errors: string[] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * Parse the public GPS payload while keeping the existing LocationSample shape.
 * The API accepts speedMps as the explicit name and retains speed for clients
 * using the current contract.
 */
export function parseLocationSample(
  body: unknown,
  now = Date.now()
): LocationValidationResult {
  if (!isRecord(body)) {
    return {
      valid: false,
      sample: null,
      errors: ["Request body must be a JSON object"],
    };
  }

  const errors: string[] = [];
  const rawSessionId = body.sessionId;
  const sessionId = typeof rawSessionId === "string" ? rawSessionId.trim() : "";

  if (sessionId.length === 0) {
    errors.push("sessionId is required and must be a non-empty string");
  }

  const lat = body.lat;
  if (!isFiniteNumber(lat) || lat < -90 || lat > 90) {
    errors.push("lat must be a finite number between -90 and 90");
  }

  const lon = body.lon;
  if (!isFiniteNumber(lon) || lon < -180 || lon > 180) {
    errors.push("lon must be a finite number between -180 and 180");
  }

  const rawAccuracy = body.accuracy === undefined
    ? DEFAULT_ACCURACY_METERS
    : body.accuracy;
  if (
    !isFiniteNumber(rawAccuracy) ||
    rawAccuracy <= 0 ||
    rawAccuracy > MAX_ACCURACY_METERS
  ) {
    errors.push(
      `accuracy must be greater than 0 and at most ${MAX_ACCURACY_METERS} meters`
    );
  }

  const hasLegacySpeed = body.speed !== undefined;
  const hasSpeedMps = body.speedMps !== undefined;
  const speedMps = body.speedMps === null ? undefined : body.speedMps;
  const legacySpeed = body.speed === null ? undefined : body.speed;
  const rawSpeed = speedMps !== undefined ? speedMps : legacySpeed;

  if (
    hasLegacySpeed &&
    hasSpeedMps &&
    speedMps !== undefined &&
    legacySpeed !== undefined &&
    legacySpeed !== speedMps
  ) {
    errors.push("speedMps and speed must match when both are provided");
  }

  if (
    rawSpeed !== undefined &&
    (!isFiniteNumber(rawSpeed) || rawSpeed < 0 || rawSpeed > MAX_SPEED_MPS)
  ) {
    errors.push(`speedMps must be between 0 and ${MAX_SPEED_MPS} m/s`);
  }

  const rawHeading = body.heading === null ? undefined : body.heading;
  if (
    rawHeading !== undefined &&
    (!isFiniteNumber(rawHeading) || rawHeading < 0 || rawHeading > 360)
  ) {
    errors.push("heading must be between 0 and 360 degrees");
  }

  const rawTimestamp = body.timestamp === undefined ? now : body.timestamp;
  if (!isFiniteNumber(rawTimestamp) || !Number.isInteger(rawTimestamp)) {
    errors.push("timestamp must be a Unix timestamp in integer milliseconds");
  } else if (
    rawTimestamp < now - MAX_TIMESTAMP_AGE_MS ||
    rawTimestamp > now + MAX_TIMESTAMP_FUTURE_MS
  ) {
    errors.push("timestamp must be within 24 hours in the past and 5 minutes in the future");
  }

  const isSimulated = body.isSimulated === undefined ? false : body.isSimulated;
  if (typeof isSimulated !== "boolean") {
    errors.push("isSimulated must be a boolean");
  }

  if (errors.length > 0) {
    return { valid: false, sample: null, errors };
  }

  return {
    valid: true,
    errors: [],
    sample: {
      sessionId,
      timestamp: rawTimestamp as number,
      lat: lat as number,
      lon: lon as number,
      accuracy: rawAccuracy as number,
      speed: rawSpeed as number | undefined,
      heading: rawHeading as number | undefined,
      isSimulated: isSimulated as boolean,
    },
  };
}
