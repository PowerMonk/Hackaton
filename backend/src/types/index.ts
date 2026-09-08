// ============================================================================
// Core Domain Types for Morelia Conecta
// ============================================================================

export interface Coordinates {
  lat: number;
  lon: number;
}

export interface GeoJSONLineString {
  type: "LineString";
  coordinates: [number, number][];
}

export interface GeoJSONMultiLineString {
  type: "MultiLineString";
  coordinates: [number, number][][];
}

export interface GeoJSONPoint {
  type: "Point";
  coordinates: [number, number];
}

// ============================================================================
// Route Types
// ============================================================================

export interface RouteDirection {
  /** Human-readable direction label (e.g., "Hacia Centro", "Dirección Norte") */
  label: string | null;
  /** Cardinal direction (N, NE, E, SE, S, SW, W, NW) */
  cardinal: string | null;
  /** Origin label if derivable from route name */
  originLabel: string | null;
  /** Destination label if derivable from route name */
  destinationLabel: string | null;
  /** Heading in degrees (0-360, 0 = North) */
  heading: number | null;
}

export interface Route {
  id: string;
  ref: string;
  name: string;
  mode: "Combi" | "Micro" | "Camión" | "Bus";
  color: string;
  osmId: number | null;
  variantes: number;
  paradasCount: number;
  sinNombre: boolean;
  fuente: "osm-demo" | "gtfs" | "api";
  geometry: GeoJSONMultiLineString;
  totalLengthM: number;
  createdAt: Date;
  /** Direction information derived from geometry (null if insufficient data) */
  direction?: RouteDirection | null;
}

export interface RouteWithVehicles extends Route {
  vehicles: VirtualVehicle[];
  activePassengers: number;
}

// ============================================================================
// Stop Types
// ============================================================================

export interface Stop {
  id: string;
  name: string | null;
  coordinates: Coordinates;
  routeIds: string[];
  createdAt: Date;
}

export interface StopWithEta extends Stop {
  eta: EtaResult | null;
  nextVehicle: VirtualVehicle | null;
}

// ============================================================================
// Boarding Session Types
// ============================================================================

export type MobilityState = "IDLE" | "WALKING" | "WAITING" | "IN_TRANSIT" | "UNKNOWN";

export interface BoardingSession {
  id: string;
  routeId: string;
  deviceId: string;
  startedAt: Date;
  endedAt: Date | null;
  currentState: MobilityState;
  currentProgress: number; // 0.0 to 1.0 along route
  currentSpeed: number; // km/h
  lastSampleAt: Date | null;
  virtualVehicleId: string | null;
  isSimulated: boolean;
}

// ============================================================================
// Location Sample Types
// ============================================================================

export interface LocationSample {
  id?: string;
  sessionId: string;
  timestamp: number;
  lat: number;
  lon: number;
  accuracy: number;
  speed?: number;
  heading?: number;
  isSimulated: boolean;
}

export interface ProcessedSample extends LocationSample {
  matchedRouteId: string | null;
  routeProgress: number | null;
  distanceFromRoute: number | null;
  inferredSpeed: number | null;
  mobilityState: MobilityState;
}

// ============================================================================
// Virtual Vehicle Types
// ============================================================================

export interface VirtualVehicle {
  id: string;
  routeId: string;
  progress: number; // 0.0 to 1.0
  speed: number; // km/h (current actual speed)
  heading: number; // degrees (geodesic bearing)
  passengerCount: number;
  confidence: "Alta" | "Media" | "Baja";
  lastUpdateAt: Date;
  currentPosition: Coordinates;
  isSimulated: boolean;
  // Extended simulation info
  state?: "moving" | "paused" | "dwelling" | "stopped";
  mode?: string; // Route mode: Combi, Micro, Camión, Bus
}

// ============================================================================
// ETA Types
// ============================================================================

export interface EtaResult {
  minMinutes: number;
  maxMinutes: number;
  label: string; // e.g., "4-6 min"
  confidence: "Alta" | "Media" | "Baja";
  vehicleId: string | null;
  stale: boolean;
  calculatedAt: Date;
}

// ============================================================================
// Route Planning Types
// ============================================================================

export type RoutePriority = "fastest" | "cheapest" | "least_walking" | "fewest_transfers";
export type TransportMode = "walk" | "transit" | "bicycle";

export interface RoutePlanRequest {
  origin: {
    label: string;
    lat: number;
    lon: number;
  };
  destination: {
    label: string;
    lat: number;
    lon: number;
  };
  priority: RoutePriority;
  modes: TransportMode[];
}

export interface RouteLeg {
  mode: TransportMode;
  from: Coordinates & { label?: string };
  to: Coordinates & { label?: string };
  distanceMeters: number;
  durationSeconds: number;
  routeId?: string;
  routeName?: string;
  routeColor?: string;
  geometry?: GeoJSONLineString;
  instructions?: string;
}

export interface RoutePlanResult {
  legs: RouteLeg[];
  totalDistanceMeters: number;
  totalDurationSeconds: number;
  totalWalkingMeters: number;
  transfers: number;
  estimatedCost?: number;
  provider: "osrm" | "geoapify" | "mock";
}

// ============================================================================
// Geocoding Types
// ============================================================================

export interface AddressSuggestion {
  id: string;
  label: string;
  lat: number;
  lon: number;
  city?: string;
  category?: string;
}

// ============================================================================
// Dashboard Types
// ============================================================================

export interface DashboardOverview {
  totalRoutes: number;
  activeRoutes: number;
  totalStops: number;
  activeVehicles: number;
  totalPassengers: number;
  avgSpeed: number;
  systemHealth: "healthy" | "degraded" | "offline";
  lastUpdateAt: Date;
}

export interface DashboardVehicle {
  vehicleId: string;
  routeId: string;
  routeName: string;
  progress: number;
  speed: number;
  passengerCount: number;
  position: Coordinates;
  confidence: string;
  lastUpdate: Date;
}

export interface DashboardStop {
  stopId: string;
  name: string;
  position: Coordinates;
  waitingPassengers: number;
  nextArrival: EtaResult | null;
  routeIds: string[];
}

// ============================================================================
// WebSocket Message Types
// ============================================================================

export type WsMessageType =
  | "vehicle_update"
  | "vehicle_snapshot"
  | "eta_update"
  | "session_start"
  | "session_end"
  | "simulation_tick"
  | "error";

export interface WsMessage {
  type: WsMessageType;
  payload: unknown;
  timestamp: number;
}

export interface WsVehicleUpdate {
  type: "vehicle_update";
  payload: {
    vehicles: VirtualVehicle[];
    routeId?: string;
  };
  timestamp: number;
}

export interface WsEtaUpdate {
  type: "eta_update";
  payload: {
    stopId: string;
    eta: EtaResult;
  };
  timestamp: number;
}

// ============================================================================
// Simulation Types
// ============================================================================

export interface SimulationConfig {
  seed: number;
  speedMultiplier: 1 | 5 | 10;
  vehiclesPerRoute: number;
  gpsNoiseMeters: number;
  dropSampleProbability: number;
  trafficPauseProbability: number;
  dwellTimeSeconds: number;
}

export interface SimulatedPassenger {
  id: string;
  sessionId: string;
  routeId: string;
  progress: number;
  speed: number;
  boardedAt: Date;
  willExitAtProgress: number;
}
