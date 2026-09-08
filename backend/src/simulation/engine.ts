// ============================================================================
// Simulation Engine
// Simulates real-world mobility scenarios for demo mode
// ============================================================================

import type {
  SimulationConfig,
  SimulatedPassenger,
  VirtualVehicle,
  LocationSample,
  Coordinates,
  Route,
  MobilityState,
} from "../types";
import {
  LCG,
  GPSNoiseGenerator,
  TrafficGenerator,
  PassengerGenerator,
} from "./prng";

const DEFAULT_CONFIG: SimulationConfig = {
  seed: 42,
  speedMultiplier: 1,
  vehiclesPerRoute: 2,
  gpsNoiseMeters: 8,
  dropSampleProbability: 0.05,
  trafficPauseProbability: 0.02,
  dwellTimeSeconds: 20,
};

interface SimulatedVehicle {
  id: string;
  routeId: string;
  progress: number;
  speed: number; // km/h
  heading: number;
  passengers: SimulatedPassenger[];
  isPaused: boolean;
  pauseEndTime: number;
  dwellEndTime: number;
  lastUpdateMs: number;
}

export class SimulationEngine {
  private config: SimulationConfig;
  private rng: LCG;
  private gpsNoise: GPSNoiseGenerator;
  private traffic: TrafficGenerator;
  private passengerGen: PassengerGenerator;

  private vehicles: Map<string, SimulatedVehicle> = new Map();
  private routes: Map<string, Route> = new Map();
  private routeGeometries: Map<string, [number, number][][]> = new Map();

  private running = false;
  private tickIntervalMs = 1000;
  private lastTickMs = 0;
  private tickCount = 0;

  private onVehicleUpdate?: (vehicles: VirtualVehicle[]) => void;
  private onLocationSample?: (sample: LocationSample) => void;

  constructor(config: Partial<SimulationConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.rng = new LCG(this.config.seed);
    this.gpsNoise = new GPSNoiseGenerator(this.config.seed + 1);
    this.traffic = new TrafficGenerator(this.config.seed + 2);
    this.passengerGen = new PassengerGenerator(this.config.seed + 3);
  }

  /** Load routes for simulation */
  loadRoutes(routes: Route[]): void {
    this.routes.clear();
    this.routeGeometries.clear();

    for (const route of routes) {
      this.routes.set(route.id, route);
      if (route.geometry?.coordinates) {
        this.routeGeometries.set(route.id, route.geometry.coordinates);
      }
    }
  }

  /** Initialize vehicles on routes */
  initializeVehicles(): void {
    this.vehicles.clear();

    for (const [routeId, route] of this.routes) {
      const geometry = this.routeGeometries.get(routeId);
      if (!geometry || geometry.length === 0) continue;

      // Create configured number of vehicles per route
      for (let i = 0; i < this.config.vehiclesPerRoute; i++) {
        const vehicleId = `sim-${routeId}-${i}`;

        // Spread vehicles along route
        const initialProgress =
          (i / this.config.vehiclesPerRoute) + this.rng.range(-0.1, 0.1);

        // Random initial speed between 15-35 km/h (Morelia urban)
        const initialSpeed = this.rng.range(15, 35);

        // Create initial passengers
        const passengerCount = this.rng.int(1, 5);
        const passengers: SimulatedPassenger[] = [];

        for (let p = 0; p < passengerCount; p++) {
          const passenger: SimulatedPassenger = {
            id: `${vehicleId}-p${p}`,
            sessionId: `session-${vehicleId}-p${p}`,
            routeId,
            progress: initialProgress,
            speed: initialSpeed,
            boardedAt: new Date(),
            willExitAtProgress: this.passengerGen.generateExitProgress(
              initialProgress
            ),
          };
          passengers.push(passenger);
        }

        const vehicle: SimulatedVehicle = {
          id: vehicleId,
          routeId,
          progress: Math.max(0, Math.min(1, initialProgress)),
          speed: initialSpeed,
          heading: 0,
          passengers,
          isPaused: false,
          pauseEndTime: 0,
          dwellEndTime: 0,
          lastUpdateMs: Date.now(),
        };

        this.vehicles.set(vehicleId, vehicle);
      }
    }

    console.log(`Initialized ${this.vehicles.size} simulated vehicles`);
  }

  /** Set callback for vehicle updates */
  onVehicleUpdates(callback: (vehicles: VirtualVehicle[]) => void): void {
    this.onVehicleUpdate = callback;
  }

  /** Set callback for location samples */
  onLocationSamples(callback: (sample: LocationSample) => void): void {
    this.onLocationSample = callback;
  }

  /** Start simulation loop */
  start(): void {
    if (this.running) return;

    this.running = true;
    this.lastTickMs = Date.now();
    this.tick();
  }

  /** Stop simulation */
  stop(): void {
    this.running = false;
  }

  /** Reset simulation to initial state */
  reset(): void {
    this.stop();
    this.tickCount = 0;
    this.initializeVehicles();
  }

  /** Get current virtual vehicles for API */
  getVirtualVehicles(): VirtualVehicle[] {
    const result: VirtualVehicle[] = [];

    for (const vehicle of this.vehicles.values()) {
      const position = this.getPositionAtProgress(
        vehicle.routeId,
        vehicle.progress
      );
      if (!position) continue;

      result.push({
        id: vehicle.id,
        routeId: vehicle.routeId,
        progress: vehicle.progress,
        speed: vehicle.speed,
        heading: vehicle.heading,
        passengerCount: vehicle.passengers.length,
        confidence: this.calculateConfidence(vehicle),
        lastUpdateAt: new Date(vehicle.lastUpdateMs),
        currentPosition: position,
        isSimulated: true,
      });
    }

    return result;
  }

  /** Get vehicles for a specific route */
  getRouteVehicles(routeId: string): VirtualVehicle[] {
    return this.getVirtualVehicles().filter((v) => v.routeId === routeId);
  }

  /** Calculate ETA from current vehicle to a progress point */
  calculateEta(
    routeId: string,
    fromProgress: number,
    toProgress: number
  ): { minMinutes: number; maxMinutes: number; confidence: string } | null {
    const route = this.routes.get(routeId);
    if (!route || toProgress <= fromProgress) return null;

    // Get average speed of vehicles on this route
    let avgSpeed = 20; // Default km/h
    let speedSamples = 0;

    for (const vehicle of this.vehicles.values()) {
      if (vehicle.routeId === routeId && vehicle.speed > 0) {
        avgSpeed = (avgSpeed * speedSamples + vehicle.speed) / (speedSamples + 1);
        speedSamples++;
      }
    }

    const remainingDistance = route.totalLengthM * (toProgress - fromProgress);
    const speedMs = avgSpeed / 3.6;
    const baseMinutes = remainingDistance / speedMs / 60;

    // Add uncertainty based on traffic and stops
    const uncertainty = 0.3 + this.rng.range(-0.1, 0.1);
    const minMinutes = Math.max(1, baseMinutes * (1 - uncertainty));
    const maxMinutes = baseMinutes * (1 + uncertainty);

    return {
      minMinutes: Math.round(minMinutes),
      maxMinutes: Math.round(maxMinutes),
      confidence: speedSamples >= 2 ? "Media" : "Baja",
    };
  }

  // ==========================================================================
  // Private Methods
  // ==========================================================================

  private tick(): void {
    if (!this.running) return;

    const now = Date.now();
    const deltaMs = (now - this.lastTickMs) * this.config.speedMultiplier;
    this.lastTickMs = now;
    this.tickCount++;

    // Update all vehicles
    for (const vehicle of this.vehicles.values()) {
      this.updateVehicle(vehicle, deltaMs);
    }

    // Broadcast updates
    if (this.onVehicleUpdate) {
      this.onVehicleUpdate(this.getVirtualVehicles());
    }

    // Generate location samples for active passengers
    if (this.tickCount % 5 === 0) {
      // Every 5 ticks (~5s at 1x)
      this.generateLocationSamples();
    }

    // Schedule next tick
    setTimeout(() => this.tick(), this.tickIntervalMs);
  }

  private updateVehicle(vehicle: SimulatedVehicle, deltaMs: number): void {
    const now = Date.now();

    // Check if paused (traffic or dwell)
    if (vehicle.isPaused) {
      if (now < vehicle.pauseEndTime || now < vehicle.dwellEndTime) {
        return;
      }
      vehicle.isPaused = false;
    }

    // Check for traffic pause
    if (this.traffic.shouldPause(this.config.trafficPauseProbability)) {
      vehicle.isPaused = true;
      vehicle.pauseEndTime = now + this.traffic.pauseDuration() * 1000;
      return;
    }

    // Apply speed variation
    const speedFactor = this.traffic.speedFactor();
    vehicle.speed = Math.max(5, Math.min(50, vehicle.speed * speedFactor));

    // Calculate distance traveled
    const route = this.routes.get(vehicle.routeId);
    if (!route) return;

    const distanceM = (vehicle.speed / 3.6) * (deltaMs / 1000);
    const progressDelta = distanceM / route.totalLengthM;

    vehicle.progress += progressDelta;

    // Check for route end (loop or reverse)
    if (vehicle.progress >= 1) {
      vehicle.progress = 0.05; // Restart near beginning
      vehicle.speed = this.rng.range(15, 35);
    }

    // Update heading based on geometry
    vehicle.heading = this.calculateHeading(vehicle.routeId, vehicle.progress);

    // Update passengers
    this.updatePassengers(vehicle);

    vehicle.lastUpdateMs = now;
  }

  private updatePassengers(vehicle: SimulatedVehicle): void {
    // Remove passengers who reached their exit
    vehicle.passengers = vehicle.passengers.filter(
      (p) => p.progress < p.willExitAtProgress
    );

    // Update remaining passengers
    for (const passenger of vehicle.passengers) {
      passenger.progress = vehicle.progress;
      passenger.speed = vehicle.speed;
    }

    // Occasionally add new passengers
    if (this.passengerGen.shouldBoard(0.1) && vehicle.passengers.length < 10) {
      const newPassenger: SimulatedPassenger = {
        id: `${vehicle.id}-p${Date.now()}`,
        sessionId: `session-${vehicle.id}-${Date.now()}`,
        routeId: vehicle.routeId,
        progress: vehicle.progress,
        speed: vehicle.speed,
        boardedAt: new Date(),
        willExitAtProgress: this.passengerGen.generateExitProgress(
          vehicle.progress
        ),
      };
      vehicle.passengers.push(newPassenger);
    }
  }

  private generateLocationSamples(): void {
    if (!this.onLocationSample) return;

    for (const vehicle of this.vehicles.values()) {
      for (const passenger of vehicle.passengers) {
        // Randomly drop some samples
        if (this.rng.bool(this.config.dropSampleProbability)) {
          continue;
        }

        const position = this.getPositionAtProgress(
          vehicle.routeId,
          passenger.progress
        );
        if (!position) continue;

        // Add GPS noise
        const noise = this.gpsNoise.generateNoise(this.config.gpsNoiseMeters);

        const sample: LocationSample = {
          sessionId: passenger.sessionId,
          timestamp: Date.now(),
          lat: position.lat + noise.latOffset,
          lon: position.lon + noise.lonOffset,
          accuracy: this.rng.range(5, 15),
          speed: passenger.speed / 3.6, // Convert to m/s
          heading: vehicle.heading,
          isSimulated: true,
        };

        this.onLocationSample(sample);
      }
    }
  }

  private getPositionAtProgress(
    routeId: string,
    progress: number
  ): Coordinates | null {
    const geometry = this.routeGeometries.get(routeId);
    if (!geometry || geometry.length === 0) return null;

    // Flatten MultiLineString to single array of points
    const allPoints: [number, number][] = geometry.flat();
    if (allPoints.length < 2) return null;

    // Calculate total length and find position
    let totalLength = 0;
    const segments: { length: number; start: number; end: number }[] = [];

    for (let i = 0; i < allPoints.length - 1; i++) {
      const segLength = this.haversineDistance(
        allPoints[i][1],
        allPoints[i][0],
        allPoints[i + 1][1],
        allPoints[i + 1][0]
      );
      segments.push({ length: segLength, start: i, end: i + 1 });
      totalLength += segLength;
    }

    const targetDistance = totalLength * Math.max(0, Math.min(1, progress));
    let traveled = 0;

    for (const seg of segments) {
      if (traveled + seg.length >= targetDistance) {
        const segProgress = (targetDistance - traveled) / seg.length;
        const startPt = allPoints[seg.start];
        const endPt = allPoints[seg.end];

        return {
          lon: startPt[0] + (endPt[0] - startPt[0]) * segProgress,
          lat: startPt[1] + (endPt[1] - startPt[1]) * segProgress,
        };
      }
      traveled += seg.length;
    }

    // Return last point
    const lastPt = allPoints[allPoints.length - 1];
    return { lon: lastPt[0], lat: lastPt[1] };
  }

  private calculateHeading(routeId: string, progress: number): number {
    const pos1 = this.getPositionAtProgress(routeId, progress);
    const pos2 = this.getPositionAtProgress(
      routeId,
      Math.min(1, progress + 0.01)
    );

    if (!pos1 || !pos2) return 0;

    const dLon = pos2.lon - pos1.lon;
    const dLat = pos2.lat - pos1.lat;

    const heading = (Math.atan2(dLon, dLat) * 180) / Math.PI;
    return (heading + 360) % 360;
  }

  private calculateConfidence(
    vehicle: SimulatedVehicle
  ): "Alta" | "Media" | "Baja" {
    const ageMs = Date.now() - vehicle.lastUpdateMs;
    const passengerCount = vehicle.passengers.length;

    if (ageMs < 30000 && passengerCount >= 2) return "Alta";
    if (ageMs < 60000 && passengerCount >= 1) return "Media";
    return "Baja";
  }

  private haversineDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
  ): number {
    const R = 6371000; // Earth radius in meters
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }
}

// Singleton instance for the application
let simulationInstance: SimulationEngine | null = null;

export function getSimulation(
  config?: Partial<SimulationConfig>
): SimulationEngine {
  if (!simulationInstance) {
    simulationInstance = new SimulationEngine(config);
  }
  return simulationInstance;
}

export function resetSimulation(): void {
  if (simulationInstance) {
    simulationInstance.stop();
    simulationInstance = null;
  }
}
