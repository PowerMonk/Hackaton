import { describe, expect, test } from "bun:test";
import {
  MAX_ACCURACY_METERS,
  MAX_SPEED_MPS,
  MAX_TIMESTAMP_AGE_MS,
  parseLocationSample,
} from "../src/services/location-validation";

const NOW = Date.parse("2026-09-08T12:00:00.000Z");

function validPayload() {
  return {
    sessionId: "session-1",
    timestamp: NOW,
    lat: 19.70078,
    lon: -101.18443,
    accuracy: 8,
    speedMps: 12,
    heading: 180,
  };
}

describe("parseLocationSample", () => {
  test("normalizes a valid speedMps payload to the existing sample contract", () => {
    const result = parseLocationSample(validPayload(), NOW);

    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.sample).toEqual({
        sessionId: "session-1",
        timestamp: NOW,
        lat: 19.70078,
        lon: -101.18443,
        accuracy: 8,
        speed: 12,
        heading: 180,
        isSimulated: false,
      });
    }
  });

  test("keeps historical defaults when optional timestamp and accuracy are absent", () => {
    const result = parseLocationSample(
      { sessionId: "session-1", lat: 19, lon: -101 },
      NOW
    );

    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.sample.timestamp).toBe(NOW);
      expect(result.sample.accuracy).toBe(10);
    }
  });

  test("accepts null optional sensor values as unavailable", () => {
    const result = parseLocationSample(
      { ...validPayload(), speedMps: null, heading: null },
      NOW
    );

    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.sample.speed).toBeUndefined();
      expect(result.sample.heading).toBeUndefined();
    }
  });

  test("rejects invalid coordinates and missing sessions", () => {
    const result = parseLocationSample(
      { lat: 91, lon: -181, accuracy: 5 },
      NOW
    );

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors).toContain("sessionId is required and must be a non-empty string");
      expect(result.errors).toContain("lat must be a finite number between -90 and 90");
      expect(result.errors).toContain("lon must be a finite number between -180 and 180");
    }
  });

  test("rejects non-positive and unreasonable accuracy", () => {
    expect(parseLocationSample({ ...validPayload(), accuracy: 0 }, NOW).valid).toBe(false);
    expect(
      parseLocationSample(
        { ...validPayload(), accuracy: MAX_ACCURACY_METERS + 1 },
        NOW
      ).valid
    ).toBe(false);
  });

  test("rejects negative and physically impossible speeds", () => {
    expect(parseLocationSample({ ...validPayload(), speedMps: -1 }, NOW).valid).toBe(false);
    expect(
      parseLocationSample({ ...validPayload(), speedMps: MAX_SPEED_MPS + 1 }, NOW).valid
    ).toBe(false);
  });

  test("rejects invalid headings and stale timestamps", () => {
    expect(parseLocationSample({ ...validPayload(), heading: 361 }, NOW).valid).toBe(false);
    expect(
      parseLocationSample(
        { ...validPayload(), timestamp: NOW - MAX_TIMESTAMP_AGE_MS - 1 },
        NOW
      ).valid
    ).toBe(false);
  });
});
