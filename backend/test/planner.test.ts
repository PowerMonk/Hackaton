import { describe, expect, test } from "bun:test";
import fixture from "../../data/planner/fixture.json";
import {
  haversineDistanceMeters,
  planProvisionalRoutes,
  type PlannerDataset,
  type PlannerRequest,
} from "../src/services/planner";

const baseRequest: PlannerRequest = {
  origin: {
    label: "Origen de prueba",
    lat: 19.7002,
    lon: -101.1992,
  },
  destination: {
    label: "Destino de prueba",
    lat: 19.7092,
    lon: -101.1812,
  },
  priority: "fastest",
  modes: ["walk", "transit"],
};

const dataset = fixture as PlannerDataset;

describe("planner provisional puro", () => {
  test("calcula Haversine de forma determinista", () => {
    const distance = haversineDistanceMeters(
      { lat: 19.7002, lon: -101.1992 },
      { lat: 19.7092, lon: -101.1812 }
    );

    expect(distance).toBeGreaterThan(1_900);
    expect(distance).toBeLessThan(2_200);
    expect(haversineDistanceMeters(
      { lat: 19.7002, lon: -101.1992 },
      { lat: 19.7092, lon: -101.1812 }
    )).toBe(distance);
  });

  test("encuentra candidatos cercanos y rutas directas", () => {
    const result = planProvisionalRoutes(baseRequest, dataset);

    expect(result.recommended?.routeIds).toEqual(["route-roja"]);
    expect(result.recommended?.legs.map((leg) => leg.mode)).toEqual([
      "walk",
      "transit",
      "walk",
    ]);
    expect(result.recommended?.transfers).toBe(0);
    expect(result.alternatives.length).toBe(2);
    expect(result.metadata.candidates.origin[0]?.stopId).toBe(
      "stop-origin-centro"
    );
    expect(result.metadata.candidates.destination[0]?.stopId).toBe(
      "stop-destination-oriente"
    );
  });

  test("ordena cheapest y conserva caminata como alternativa barata", () => {
    const result = planProvisionalRoutes(
      { ...baseRequest, priority: "cheapest" },
      dataset
    );

    expect(result.recommended?.id).toBe("walk-direct");
    expect(result.recommended?.estimatedCost).toBe(0);
    expect(result.plans.map((plan) => plan.estimatedCost)).toEqual([0, 10, 12]);
  });

  test("admite las cuatro prioridades de ranking", () => {
    const expected = {
      fastest: "transit-route-roja",
      least_walking: "transit-route-roja",
      fewest_transfers: "transit-route-roja",
      cheapest: "walk-direct",
    } as const;

    for (const priority of Object.keys(expected) as Array<keyof typeof expected>) {
      const result = planProvisionalRoutes(
        { ...baseRequest, priority },
        dataset
      );
      expect(result.recommended?.id).toBe(expected[priority]);
    }
  });

  test("aplica el factor configurable solo a la caminata aproximada", () => {
    const unitFactorResult = planProvisionalRoutes(
      {
        ...baseRequest,
        config: { walkingDistanceFactor: 1 },
      },
      dataset
    );
    const doubledResult = planProvisionalRoutes(
      {
        ...baseRequest,
        config: { walkingDistanceFactor: 2 },
      },
      dataset
    );
    const doubledWalk = doubledResult.plans.find(
      (plan) => plan.id === "walk-direct"
    );
    const unitFactorWalk = unitFactorResult.plans.find(
      (plan) => plan.id === "walk-direct"
    );

    expect(
      Math.abs(
        (doubledWalk?.totalWalkingMeters ?? 0) -
          (unitFactorWalk?.totalWalkingMeters ?? 0) * 2
      )
    ).toBeLessThanOrEqual(1);
    expect(doubledResult.metadata.walkingDistanceFactor).toBe(2);
  });

  test("usa fallback de caminata completa cuando no hay conexion directa", () => {
    const disconnected: PlannerDataset = {
      coverage: { source: "osm-demo", knownStops: 39, complete: false },
      stops: [
        {
          id: "only-origin",
          name: "Origen cercano",
          coordinates: { lat: 19.7005, lon: -101.199 },
          routeIds: ["route-only-origin"],
        },
        {
          id: "only-destination",
          name: "Destino cercano",
          coordinates: { lat: 19.7095, lon: -101.181 },
          routeIds: ["route-only-destination"],
        },
      ],
      routes: [
        { id: "route-only-origin", name: "Origen", stopIds: ["only-origin"] },
        {
          id: "route-only-destination",
          name: "Destino",
          stopIds: ["only-destination"],
        },
      ],
    };
    const result = planProvisionalRoutes(
      { ...baseRequest, modes: ["transit"] },
      disconnected
    );

    expect(result.recommended?.id).toBe("walk-fallback");
    expect(result.recommended?.isFallback).toBe(true);
    expect(result.metadata.fallbackUsed).toBe(true);
    expect(result.metadata.warnings.join(" ")).toContain("caminata completa");
  });

  test("expone provisionalidad, falta de horarios y cobertura incompleta", () => {
    const result = planProvisionalRoutes(baseRequest, dataset);

    expect(result.metadata.provisional).toBe(true);
    expect(result.metadata.confidence).toBe("low");
    expect(result.metadata.officialSchedulesAvailable).toBe(false);
    expect(result.metadata.stopCoverage.knownStops).toBe(39);
    expect(result.metadata.warnings.join(" ")).toContain("39 paradas");
    expect(result.metadata.warnings.join(" ")).toContain("horarios oficiales");
  });
});
