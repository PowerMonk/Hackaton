// Shared transport contracts for the live mobility integration.
// These types describe JSON over HTTP/WebSocket, not database row shapes.

import type {
  Coordinates,
  MobilityState,
  RouteLeg,
} from "./index";

/** Unix epoch milliseconds in UTC. */
export type UnixMs = number;

/** Linear distance in meters. */
export type Meters = number;

/** Fraction along a route. Consumers must keep this in the inclusive 0..1 range. */
export type RouteProgress = number;

export type ConfidenceLevel = "Alta" | "Media" | "Baja";

// ============================================================================
// Location and route matching
// ============================================================================

/** Location payload sent by a consenting passenger device. */
export interface LocationSample {
  sessionId: string;
  /** Unix milliseconds, UTC. */
  timestamp: UnixMs;
  lat: number;
  lon: number;
  /** Horizontal accuracy in meters. */
  accuracy: Meters;
  /** Input speed in meters per second. */
  speedMps?: number | null;
  /** Compass heading in degrees, clockwise from north. */
  heading?: number | null;
  isSimulated: boolean;
}

/** Result of matching a location to a route geometry. */
export interface RouteMatch {
  routeId: string;
  /** Perpendicular distance from the sample to the route in meters. */
  distanceMeters: Meters;
  /** Position along the matched route, constrained to 0..1. */
  progress: RouteProgress;
}

export interface ProcessedLocationSample extends LocationSample {
  routeMatch: RouteMatch | null;
  /** Derived speed in km/h, matching the persisted mobility model. */
  inferredSpeedKmh: number | null;
  mobilityState: MobilityState;
}

// ============================================================================
// Boarding sessions
// ============================================================================

export interface CreateBoardingSessionRequest {
  routeId: string;
  deviceId: string;
  isSimulated?: boolean;
}

/** JSON DTO for the BoardingSession model in backend/src/types/index.ts. */
export interface BoardingSessionDto {
  id: string;
  routeId: string;
  deviceId: string;
  /** Unix milliseconds, UTC. */
  startedAt: UnixMs;
  /** Unix milliseconds, UTC, or null while active. */
  endedAt: UnixMs | null;
  currentState: MobilityState;
  /** Progress along the route, constrained to 0..1. */
  currentProgress: RouteProgress;
  /** Persisted/current speed in km/h. */
  currentSpeed: number;
  /** Unix milliseconds, UTC, or null when no sample has arrived. */
  lastSampleAt: UnixMs | null;
  virtualVehicleId: string | null;
  isSimulated: boolean;
}

// ============================================================================
// Vehicles and ETA
// ============================================================================

/** Vehicle snapshot shared by nearby responses and WebSocket updates. */
export interface VirtualVehicleUpdate {
  id: string;
  routeId: string;
  /** Progress along the route, constrained to 0..1. */
  progress: RouteProgress;
  /** Persisted/display speed in km/h. */
  speed: number;
  heading: number;
  passengerCount: number;
  confidence: ConfidenceLevel;
  currentPosition: Coordinates;
  /** Unix milliseconds, UTC. */
  lastUpdateAt: UnixMs;
  isSimulated: boolean;
}

export interface EtaInfo {
  minMinutes: number;
  maxMinutes: number;
  label: string;
  confidence: ConfidenceLevel;
  vehicleId: string | null;
  stale: boolean;
  /** Unix milliseconds, UTC. */
  calculatedAt: UnixMs;
}

export interface NearbyVehicle extends VirtualVehicleUpdate {
  /** Distance from the requested point in meters. */
  distanceMeters: Meters;
  eta: EtaInfo | null;
}

export interface NearbyVehiclesResponse {
  vehicles: NearbyVehicle[];
  count: number;
  /** Unix milliseconds, UTC. */
  timestamp: UnixMs;
}

// ============================================================================
// WebSocket events: /ws/mobility
// ============================================================================

export interface WebSocketEvent<
  TType extends string = string,
  TPayload = unknown,
> {
  type: TType;
  payload: TPayload;
  /** Unix milliseconds, UTC. */
  timestamp: UnixMs;
}

export type ConnectedEvent = WebSocketEvent<
  "connected",
  { message: string; timestamp: UnixMs }
>;

export type SubscribedEvent = WebSocketEvent<
  "subscribed" | "unsubscribed",
  { routeId: string }
>;

export type VehicleUpdateEvent = WebSocketEvent<
  "vehicle_update",
  { vehicles: VirtualVehicleUpdate[]; routeId?: string }
>;

export type EtaUpdateEvent = WebSocketEvent<
  "eta_update",
  { stopId: string; eta: EtaInfo }
>;

export type SessionStartEvent = WebSocketEvent<
  "session_start",
  { sessionId: string; routeId: string }
>;

export type SessionEndEvent = WebSocketEvent<
  "session_end",
  { sessionId: string }
>;

export type SimulationTickEvent = WebSocketEvent<
  "simulation_tick",
  { tick: number }
>;

export type ErrorEvent = WebSocketEvent<
  "error",
  { message: string; code?: string }
>;

export type PongEvent = WebSocketEvent<
  "pong",
  { serverTime: UnixMs }
>;

export type MobilityWebSocketEvent =
  | ConnectedEvent
  | SubscribedEvent
  | VehicleUpdateEvent
  | EtaUpdateEvent
  | SessionStartEvent
  | SessionEndEvent
  | SimulationTickEvent
  | ErrorEvent
  | PongEvent;

export type MobilityWebSocketCommand =
  | { type: "subscribe"; routeId: string }
  | { type: "unsubscribe"; routeId: string }
  | { type: "ping" };

// ============================================================================
// Route planning
// ============================================================================

/** Alias retaining the RouteLeg shape already used by the backend. */
export type RoutePlanLeg = RouteLeg;

export interface RoutePlanResult {
  legs: RoutePlanLeg[];
  totalDistanceMeters: Meters;
  totalDurationSeconds: number;
  totalWalkingMeters: Meters;
  transfers: number;
  estimatedCost?: number;
  provider: "osrm" | "geoapify" | "mock";
}
