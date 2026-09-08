// ============================================================================
// WebSocket Handler
// Real-time updates for vehicle positions and ETAs
// ============================================================================

import type { ServerWebSocket } from "bun";
import type { VirtualVehicle, WsMessage, EtaResult } from "../types";

interface WsData {
  connectedAt: number;
  subscribedRoutes?: Set<string>;
}

// Connected clients
const clients = new Set<ServerWebSocket<WsData>>();

// ============================================================================
// WebSocket Handler Configuration
// ============================================================================

export const handleWebSocket = {
  open(ws: ServerWebSocket<WsData>) {
    clients.add(ws);
    console.log(`WebSocket connected (${clients.size} total)`);

    // Send welcome message
    ws.send(
      JSON.stringify({
        type: "connected",
        payload: {
          message: "Connected to Morelia Conecta mobility stream",
          timestamp: Date.now(),
        },
      })
    );
  },

  message(ws: ServerWebSocket<WsData>, message: string | Buffer) {
    try {
      const data = JSON.parse(message.toString());

      switch (data.type) {
        case "subscribe":
          // Subscribe to specific route updates
          if (!ws.data.subscribedRoutes) {
            ws.data.subscribedRoutes = new Set();
          }
          if (data.routeId) {
            ws.data.subscribedRoutes.add(data.routeId);
            ws.send(
              JSON.stringify({
                type: "subscribed",
                payload: { routeId: data.routeId },
                timestamp: Date.now(),
              })
            );
          }
          break;

        case "unsubscribe":
          if (ws.data.subscribedRoutes && data.routeId) {
            ws.data.subscribedRoutes.delete(data.routeId);
            ws.send(
              JSON.stringify({
                type: "unsubscribed",
                payload: { routeId: data.routeId },
                timestamp: Date.now(),
              })
            );
          }
          break;

        case "ping":
          ws.send(
            JSON.stringify({
              type: "pong",
              payload: { serverTime: Date.now() },
              timestamp: Date.now(),
            })
          );
          break;

        default:
          console.warn("Unknown WebSocket message type:", data.type);
      }
    } catch (error) {
      console.error("WebSocket message parse error:", error);
      ws.send(
        JSON.stringify({
          type: "error",
          payload: { message: "Invalid message format" },
          timestamp: Date.now(),
        })
      );
    }
  },

  close(ws: ServerWebSocket<WsData>) {
    clients.delete(ws);
    console.log(`WebSocket disconnected (${clients.size} remaining)`);
  },

  error(ws: ServerWebSocket<WsData>, error: Error) {
    console.error("WebSocket error:", error);
    clients.delete(ws);
  },
};

// ============================================================================
// Broadcast Functions
// ============================================================================

/**
 * Broadcast vehicle updates to all connected clients
 */
export function broadcastVehicleUpdate(vehicles: VirtualVehicle[]): void {
  if (clients.size === 0) return;

  const message: WsMessage = {
    type: "vehicle_update",
    payload: { vehicles },
    timestamp: Date.now(),
  };

  const messageStr = JSON.stringify(message);

  // Group vehicles by route for filtered sending
  const vehiclesByRoute = new Map<string, VirtualVehicle[]>();
  for (const vehicle of vehicles) {
    const existing = vehiclesByRoute.get(vehicle.routeId) || [];
    existing.push(vehicle);
    vehiclesByRoute.set(vehicle.routeId, existing);
  }

  for (const client of clients) {
    try {
      // If client has route subscriptions, filter vehicles
      if (client.data.subscribedRoutes && client.data.subscribedRoutes.size > 0) {
        const filteredVehicles: VirtualVehicle[] = [];

        for (const routeId of client.data.subscribedRoutes) {
          const routeVehicles = vehiclesByRoute.get(routeId);
          if (routeVehicles) {
            filteredVehicles.push(...routeVehicles);
          }
        }

        if (filteredVehicles.length > 0) {
          const filteredMessage: WsMessage = {
            type: "vehicle_update",
            payload: { vehicles: filteredVehicles },
            timestamp: Date.now(),
          };
          client.send(JSON.stringify(filteredMessage));
        }
      } else {
        // Send all vehicles
        client.send(messageStr);
      }
    } catch (error) {
      console.error("Error sending to WebSocket client:", error);
    }
  }
}

/**
 * Broadcast ETA update for a specific stop
 */
export function broadcastEtaUpdate(stopId: string, eta: EtaResult): void {
  if (clients.size === 0) return;

  const message: WsMessage = {
    type: "eta_update",
    payload: { stopId, eta },
    timestamp: Date.now(),
  };

  const messageStr = JSON.stringify(message);

  for (const client of clients) {
    try {
      client.send(messageStr);
    } catch (error) {
      console.error("Error sending ETA update:", error);
    }
  }
}

/**
 * Broadcast session start event
 */
export function broadcastSessionStart(
  sessionId: string,
  routeId: string
): void {
  broadcast({
    type: "session_start",
    payload: { sessionId, routeId },
    timestamp: Date.now(),
  });
}

/**
 * Broadcast session end event
 */
export function broadcastSessionEnd(sessionId: string): void {
  broadcast({
    type: "session_end",
    payload: { sessionId },
    timestamp: Date.now(),
  });
}

/**
 * Broadcast simulation tick (for debugging/dashboard)
 */
export function broadcastSimulationTick(tickNumber: number): void {
  broadcast({
    type: "simulation_tick",
    payload: { tick: tickNumber },
    timestamp: Date.now(),
  });
}

/**
 * Generic broadcast to all clients
 */
function broadcast(message: WsMessage): void {
  if (clients.size === 0) return;

  const messageStr = JSON.stringify(message);

  for (const client of clients) {
    try {
      client.send(messageStr);
    } catch (error) {
      console.error("Broadcast error:", error);
    }
  }
}

// ============================================================================
// Stats
// ============================================================================

export function getConnectionStats(): {
  totalConnections: number;
  subscribedRoutes: Map<string, number>;
} {
  const subscribedRoutes = new Map<string, number>();

  for (const client of clients) {
    if (client.data.subscribedRoutes) {
      for (const routeId of client.data.subscribedRoutes) {
        subscribedRoutes.set(routeId, (subscribedRoutes.get(routeId) || 0) + 1);
      }
    }
  }

  return {
    totalConnections: clients.size,
    subscribedRoutes,
  };
}
