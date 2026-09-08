import { describe, expect, test } from "bun:test";
import {
  areObservationsCompatible,
  clusterVehicleObservations,
  isObservationFresh,
  type VehicleObservation,
} from "../src/services/vehicle-clustering";

const now = new Date("2026-09-08T12:00:00.000Z");
const routeLengthM = 10_000;

function observation(overrides: Partial<VehicleObservation> = {}): VehicleObservation {
  return {
    id: "sample",
    sessionId: "session",
    routeId: "route-1",
    progress: 0.5,
    speedKmh: 20,
    heading: 90,
    observedAt: now,
    routeLengthM,
    ...overrides,
  };
}

describe("vehicle clustering", () => {
  test("groups observations within route distance, speed, and heading tolerances", () => {
    const clusters = clusterVehicleObservations([
      observation({ id: "a", progress: 0.500, speedKmh: 20 }),
      observation({ id: "b", progress: 0.512, speedKmh: 29, heading: 120 }),
      observation({ id: "c", progress: 0.530, speedKmh: 20 }),
    ], { now });

    expect(clusters).toHaveLength(2);
    expect(clusters[0].observations.map(({ id }) => id)).toEqual(["a", "b"]);
    expect(clusters[0].distanceSpreadM).toBeCloseTo(120, 8);
  });

  test("does not merge different routes, incompatible headings, or distant samples", () => {
    const base = observation();
    expect(areObservationsCompatible(base, observation({ routeId: "route-2" }))).toBe(false);
    expect(areObservationsCompatible(base, observation({ heading: 180 }))).toBe(false);
    expect(areObservationsCompatible(base, observation({ progress: 0.52 }))).toBe(false);
    expect(areObservationsCompatible(base, observation({ speedKmh: 30 }))).toBe(true);
    expect(areObservationsCompatible(base, observation({ speedKmh: 31 }))).toBe(false);
  });

  test("accepts wraparound headings and missing heading", () => {
    const base = observation({ heading: 359 });
    expect(areObservationsCompatible(base, observation({ heading: 1 }))).toBe(true);
    expect(areObservationsCompatible(base, observation({ heading: null }))).toBe(true);
  });

  test("excludes samples older than 90 seconds", () => {
    const stale = observation({
      id: "stale",
      observedAt: new Date(now.getTime() - 91_000),
    });
    expect(isObservationFresh(stale, now)).toBe(false);
    expect(clusterVehicleObservations([stale, observation({ id: "fresh" })], { now })).toHaveLength(1);
    expect(clusterVehicleObservations([stale, observation({ id: "fresh" })], { now })[0].observations[0].id)
      .toBe("fresh");
  });

  test("uses route length to apply the approximate 100-150 m rule", () => {
    const clusters = clusterVehicleObservations([
      observation({ id: "a", progress: 0.5 }),
      observation({ id: "b", progress: 0.5125 }),
    ], { now, distanceToleranceM: 125 });

    expect(clusters).toHaveLength(1);
  });
});
