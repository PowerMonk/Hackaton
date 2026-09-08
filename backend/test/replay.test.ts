import { describe, expect, test } from "bun:test";
import { parseReplayConfig, runReplay } from "../src/simulation/replay";

describe("demo replay", () => {
  test("parses environment defaults and supported speed multipliers", () => {
    const config = parseReplayConfig([], {
      REPLAY_BASE_URL: "http://example.test/api/",
      REPLAY_SEED: "99",
      REPLAY_SPEED_MULTIPLIER: "10",
      REPLAY_PASSENGERS: "2",
    });

    expect(config).toEqual({
      baseUrl: "http://example.test/api",
      seed: 99,
      speedMultiplier: 10,
      steps: 12,
      intervalSeconds: 2,
      passengers: 2,
      requestTimeoutMs: 10_000,
    });
  });

  test("creates sessions and sends a small noisy multi-user replay over HTTP", async () => {
    const requests: Array<{ path: string; method: string; body?: Record<string, unknown> }> = [];
    let sessionNumber = 0;
    const fakeFetch: typeof fetch = async (input, init) => {
      const url = new URL(String(input));
      const body = typeof init?.body === "string" ? JSON.parse(init.body) as Record<string, unknown> : undefined;
      requests.push({ path: url.pathname, method: init?.method || "GET", body });

      if (url.pathname === "/routes" && init?.method === "GET") {
        return Response.json({ routes: [{ id: "route-demo" }] });
      }
      if (url.pathname === "/routes/route-demo" && init?.method === "GET") {
        return Response.json({
          id: "route-demo",
          geometry: {
            type: "LineString",
            coordinates: [[-101.2, 19.7], [-101.19, 19.7], [-101.18, 19.71]],
          },
        });
      }
      if (url.pathname === "/boarding-sessions" && init?.method === "POST") {
        sessionNumber++;
        return Response.json({ id: `session-${sessionNumber}` }, { status: 201 });
      }
      if (url.pathname === "/locations" && init?.method === "POST") {
        return Response.json({ received: true }, { status: 201 });
      }
      if (url.pathname.startsWith("/boarding-sessions/") && init?.method === "DELETE") {
        return Response.json({ success: true });
      }
      return Response.json({ error: "unexpected request" }, { status: 500 });
    };

    const stats = await runReplay(
      {
        baseUrl: "http://example.test",
        seed: 7,
        speedMultiplier: 10,
        steps: 6,
        intervalSeconds: 1,
        passengers: 2,
        requestTimeoutMs: 1000,
      },
      { fetchImpl: fakeFetch, sleep: async () => {}, now: () => 1_700_000_000_000 },
    );

    expect(stats.routeId).toBe("route-demo");
    expect(stats.sessionsCreated).toBe(2);
    expect(stats.sessionsEnded).toBe(2);
    expect(stats.generatedSamples).toBe(12);
    expect(stats.discardedSamples).toBeGreaterThanOrEqual(1);
    expect(stats.sentSamples + stats.discardedSamples).toBe(12);
    expect(stats.failedSamples).toBe(0);
    expect(stats.pausedSamples).toBeGreaterThanOrEqual(1);

    const locationRequests = requests.filter((request) => request.path === "/locations");
    expect(locationRequests.length).toBe(stats.sentSamples);
    expect(locationRequests.every((request) => request.body?.isSimulated === true)).toBe(true);
    expect(locationRequests.some((request) => request.body?.speed === 0)).toBe(true);
    expect(new Set(locationRequests.map((request) => request.body?.sessionId)).size).toBe(2);
  });
});
