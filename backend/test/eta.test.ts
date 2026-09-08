import { describe, expect, test } from "bun:test";
import {
  calculateEta,
  selectBestVehicleEta,
  smoothSpeedKmh,
} from "../src/services/eta";

const now = new Date("2026-09-08T12:00:00.000Z");

describe("ETA", () => {
  test("smooths speed history and includes remaining distance plus dwell", () => {
    const result = calculateEta({
      routeId: "route-1",
      vehicleId: "vehicle-1",
      fromProgress: 0.4,
      targetProgress: 0.6,
      routeLengthM: 10_000,
      speedKmh: 20,
      speedHistoryKmh: [10, 20],
      lastObservedAt: now,
    }, { now, dwellSeconds: 30 });

    expect(smoothSpeedKmh([10, 20, 20])).toBeCloseTo(15.775, 3);
    expect(result.remainingDistanceM).toBeCloseTo(2_000, 8);
    expect(result.smoothedSpeedKmh).toBeCloseTo(15.775, 3);
    expect(result.dwellMinutes).toBe(0.5);
    expect(result.vehicleId).toBe("vehicle-1");
    expect(result.stale).toBe(false);
  });

  test("returns a wider low-confidence range for stale observations", () => {
    const result = calculateEta({
      routeId: "route-1",
      fromProgress: 0.5,
      targetProgress: 0.75,
      routeLengthM: 12_000,
      speedKmh: 24,
      lastObservedAt: new Date(now.getTime() - 91_000),
    }, { now });

    expect(result.stale).toBe(true);
    expect(result.confidence).toBe("Baja");
    expect(result.minMinutes).toBe(3);
    expect(result.maxMinutes).toBe(12);
  });

  test("gives high confidence with several recent speed samples", () => {
    const result = calculateEta({
      routeId: "route-1",
      fromProgress: 0.2,
      targetProgress: 0.3,
      routeLengthM: 10_000,
      speedKmh: 21,
      speedHistoryKmh: [19, 20, 22],
      lastObservedAt: now,
    }, { now });

    expect(result.confidence).toBe("Alta");
    expect(result.label).toMatch(/^\d+-\d+ min$/);
    expect(result.maxMinutes).toBeGreaterThanOrEqual(result.minMinutes);
  });

  test("does not produce negative distance when vehicle is already past target", () => {
    const result = calculateEta({
      routeId: "route-1",
      fromProgress: 0.8,
      targetProgress: 0.7,
      routeLengthM: 10_000,
      speedKmh: 20,
      lastObservedAt: now,
    }, { now, dwellSeconds: 20 });

    expect(result.remainingDistanceM).toBe(0);
    expect(result.minMinutes).toBe(0);
    expect(result.maxMinutes).toBe(1);
  });

  test("prefers a vehicle still approaching over one that already passed", () => {
    const result = selectBestVehicleEta(
      [
        {
          id: "passed",
          progress: 0.75,
          speedKmh: 20,
          lastObservedAt: now,
        },
        {
          id: "approaching",
          progress: 0.55,
          speedKmh: 20,
          lastObservedAt: now,
        },
      ],
      0.6,
      10_000,
      "route-1",
      { now, allowNextLoop: true },
    );

    expect(result?.vehicleId).toBe("approaching");
    expect(result?.isNextLoop).toBe(false);
  });
});
