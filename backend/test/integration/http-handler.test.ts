import { describe, expect, test } from "bun:test";
import { handleRequest } from "../../src/routes/handler";

const offlineState = {
  dbConnected: false,
  schemaReady: false,
  routeCount: 0,
  stopCount: 0,
  simulationRunning: false,
};

describe("HTTP integration boundaries", () => {
  test("does not acknowledge a location when persistence is unavailable", async () => {
    const response = await handleRequest(
      new Request("http://localhost/locations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: "session-live",
          lat: 19.7,
          lon: -101.2,
          accuracy: 10,
          timestamp: Date.now(),
          isSimulated: false,
        }),
      }),
      offlineState,
    );

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: "Location sample could not be persisted because the database is unavailable",
    });
  });

  test("uses the pure provisional planner offline and preserves legacy fields", async () => {
    const response = await handleRequest(
      new Request("http://localhost/route-plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          origin: { label: "Centro", lat: 19.7002, lon: -101.1992 },
          destination: { label: "Oriente", lat: 19.7092, lon: -101.1812 },
          priority: "fastest",
          modes: ["walk", "transit"],
        }),
      }),
      offlineState,
    );

    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.provider).toBe("mock");
    expect(Array.isArray(body.legs)).toBe(true);
    expect(body.metadata.provisional).toBe(true);
    expect(body.metadata.fallbackUsed).toBe(true);
    expect(body.recommended.isFallback).toBe(true);
  });
});
