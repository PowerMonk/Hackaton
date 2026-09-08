// ============================================================================
// Simulation Engine
// Simulates real-world mobility scenarios for demo mode
// All speeds are in km/h internally
// ============================================================================

import type {
  SimulationConfig,
  SimulatedPassenger,
  VirtualVehicle,
  LocationSample,
  Coordinates,
  Route,
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
  vehiclesPerRoute: 4, // Increased from 2
  gpsNoiseMeters: 8,
  dropSampleProbability: 0.05,
  trafficPauseProbability: 0.02,
  dwellTimeSeconds: 20,
};

const LOCATION_SAMPLE_INTERVAL_TICKS = 30;

// Initial positions for vehicles (distributed along route)
const VEHICLE_INITIAL_POSITIONS = [0.05, 0.30, 0.60, 0.85];

// Pre-calculated segment info for efficient position lookups
interface SegmentInfo {
  startProgress: number;
  endProgress: number;
  lengthM: number;
  points: [number, number][];
}

interface SimulatedVehicle {
  id: string;
  routeId: string;
  progress: number;
  speed: number; // km/h
  heading: number;
  passengers: SimulatedPassenger[];
  isPaused: boolean;
  pauseEndTime: number;
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
  private routeLengths: Map<string, number> = new Map();
  // Pre-computed segment info for each route (avoids flattening errors)
  private routeSegments: Map<string, SegmentInfo[]> = new Map();

  private running = false;
  private tickIntervalMs = 1000;
  private lastTickMs = 0;
  private tickCount = 0;
  private timerId: ReturnType<typeof setTimeout> | null = null;

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
    this.routeLengths.clear();
    this.routeSegments.clear();

    for (const route of routes) {
      this.routes.set(route.id, route);
      if (route.geometry?.coordinates) {
        this.routeGeometries.set(route.id, route.geometry.coordinates);
        const totalLength = route.totalLengthM || this.calculateLength(route.geometry.coordinates);
        this.routeLengths.set(route.id, totalLength);

        // Pre-compute segment info for proper position calculations
        const segmentInfos = this.computeSegmentInfo(route.geometry.coordinates, totalLength);
        this.routeSegments.set(route.id, segmentInfos);
      }
    }

    console.log(`Simulation: Loaded ${routes.length} routes`);
  }

  /** Pre-compute segment boundaries and lengths for accurate position tracking */
  private computeSegmentInfo(coordinates: [number, number][][], totalLength: number): SegmentInfo[] {
    const segments: SegmentInfo[] = [];
    let accumulatedLength = 0;

    for (const line of coordinates) {
      if (line.length < 2) continue;

      let segmentLength = 0;
      for (let i = 0; i < line.length - 1; i++) {
        segmentLength += this.haversineDistance(
          line[i][1], line[i][0],
          line[i + 1][1], line[i + 1][0]
        );
      }

      if (segmentLength > 0) {
        segments.push({
          startProgress: accumulatedLength / totalLength,
          endProgress: (accumulatedLength + segmentLength) / totalLength,
          lengthM: segmentLength,
          points: line,
        });
        accumulatedLength += segmentLength;
      }
    }

    return segments;
  }

  /** Calculate total length of MultiLineString in meters */
  private calculateLength(coordinates: [number, number][][]): number {
    let total = 0;
    for (const line of coordinates) {
      for (let i = 0; i < line.length - 1; i++) {
        total += this.haversineDistance(
          line[i][1], line[i][0],
          line[i + 1][1], line[i + 1][0]
        );
      }
    }
    return total;
  }

  /** Initialize vehicles on routes */
  initializeVehicles(): void {
    this.vehicles.clear();

    let vehicleIndex = 0;
    for (const [routeId, route] of this.routes) {
      const segments = this.routeSegments.get(routeId);
      if (!segments || segments.length === 0) continue;

      // Create vehicles for this route (up to 4)
      const numVehicles = Math.min(this.config.vehiclesPerRoute, VEHICLE_INITIAL_POSITIONS.length);

      for (let i = 0; i < numVehicles; i++) {
        const vehicleId = `sim-v${vehicleIndex++}`;

        // Use predefined positions with small jitter
        const baseProgress = VEHICLE_INITIAL_POSITIONS[i];
        const jitter = this.rng.range(-0.02, 0.02);
        const initialProgress = Math.max(0.02, Math.min(0.98, baseProgress + jitter));

        // Validate that progress is within a valid segment
        const validProgress = this.snapToValidSegment(routeId, initialProgress);

        // Initial speed: 15-30 km/h (urban Morelia)
        const initialSpeed = this.rng.range(15, 30);

        // Create initial passengers (2-5 per vehicle)
        const passengerCount = this.rng.int(2, 5);
        const passengers: SimulatedPassenger[] = [];

        for (let p = 0; p < passengerCount; p++) {
          passengers.push({
            id: `${vehicleId}-p${p}`,
            sessionId: `session-${vehicleId}-p${p}`,
            routeId,
            progress: validProgress,
            speed: initialSpeed,
            boardedAt: new Date(),
            willExitAtProgress: this.passengerGen.generateExitProgress(validProgress),
          });
        }

        const vehicle: SimulatedVehicle = {
          id: vehicleId,
          routeId,
          progress: validProgress,
          speed: initialSpeed,
          heading: 0,
          passengers,
          isPaused: false,
          pauseEndTime: 0,
          lastUpdateMs: Date.now(),
        };

        this.vehicles.set(vehicleId, vehicle);
      }
    }

    console.log(`Simulation: Initialized ${this.vehicles.size} vehicles across ${this.routes.size} routes`);
  }

  /** Snap progress to nearest valid segment (avoid gaps between disconnected segments) */
  private snapToValidSegment(routeId: string, progress: number): number {
    const segments = this.routeSegments.get(routeId);
    if (!segments || segments.length === 0) return progress;

    // Check if progress falls within any segment
    for (const seg of segments) {
      if (progress >= seg.startProgress && progress <= seg.endProgress) {
        return progress; // Already in a valid segment
      }
    }

    // Find nearest segment boundary
    let nearestProgress = progress;
    let minDistance = Infinity;

    for (const seg of segments) {
      const distToStart = Math.abs(progress - seg.startProgress);
      const distToEnd = Math.abs(progress - seg.endProgress);

      if (distToStart < minDistance) {
        minDistance = distToStart;
        nearestProgress = seg.startProgress + 0.001; // Slightly inside segment
      }
      if (distToEnd < minDistance) {
        minDistance = distToEnd;
        nearestProgress = seg.endProgress - 0.001;
      }
    }

    return nearestProgress;
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
    this.scheduleTick();
    console.log("Simulation: Started");
  }

  /** Stop simulation */
  stop(): void {
    this.running = false;
    if (this.timerId) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
    console.log("Simulation: Stopped");
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
      const position = this.getPositionAtProgress(vehicle.routeId, vehicle.progress);
      if (!position) continue;

      result.push({
        id: vehicle.id,
        routeId: vehicle.routeId,
        progress: vehicle.progress,
        speed: vehicle.speed, // km/h
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

  /** Calculate ETA between two progress points */
  calculateEta(
    routeId: string,
    fromProgress: number,
    toProgress: number
  ): { minMinutes: number; maxMinutes: number; confidence: string } | null {
    if (toProgress <= fromProgress) return null;

    const routeLength = this.routeLengths.get(routeId);
    if (!routeLength) return null;

    // Get average speed of vehicles on this route
    let avgSpeed = 20; // Default km/h
    let count = 0;

    for (const vehicle of this.vehicles.values()) {
      if (vehicle.routeId === routeId && vehicle.speed > 0) {
        avgSpeed = (avgSpeed * count + vehicle.speed) / (count + 1);
        count++;
      }
    }

    const remainingDistance = routeLength * (toProgress - fromProgress);
    const speedMs = avgSpeed / 3.6; // Convert to m/s
    const baseMinutes = (remainingDistance / speedMs) / 60;

    // Add uncertainty
    const uncertainty = 0.25 + this.rng.range(0, 0.1);
    const minMinutes = Math.max(1, Math.round(baseMinutes * (1 - uncertainty)));
    const maxMinutes = Math.round(baseMinutes * (1 + uncertainty));

    return {
      minMinutes,
      maxMinutes,
      confidence: count >= 2 ? "Media" : "Baja",
    };
  }

  // ==========================================================================
  // Private Methods
  // ==========================================================================

  private scheduleTick(): void {
    if (!this.running) return;

    this.timerId = setTimeout(() => {
      this.tick();
      this.scheduleTick();
    }, this.tickIntervalMs / this.config.speedMultiplier);
  }

  private tick(): void {
    if (!this.running) return;

    const now = Date.now();
    const deltaMs = this.tickIntervalMs; // Fixed time step
    this.lastTickMs = now;
    this.tickCount++;

    // Update all vehicles
    for (const vehicle of this.vehicles.values()) {
      this.updateVehicle(vehicle, deltaMs);
    }

    // Broadcast vehicle updates
    if (this.onVehicleUpdate) {
      this.onVehicleUpdate(this.getVirtualVehicles());
    }

    // Generate one representative sample per vehicle every 30 seconds.
    if (this.tickCount % LOCATION_SAMPLE_INTERVAL_TICKS === 0 && this.onLocationSample) {
      this.generateLocationSamples();
    }
  }

  private updateVehicle(vehicle: SimulatedVehicle, deltaMs: number): void {
    const now = Date.now();

    // Check if paused (speed = 0 while paused)
    if (vehicle.isPaused) {
      vehicle.speed = 0; // Report actual zero speed when paused
      if (now < vehicle.pauseEndTime) {
        vehicle.lastUpdateMs = now;
        return;
      }
      vehicle.isPaused = false;
      vehicle.speed = this.rng.range(12, 25); // Resume with new speed
    }

    // Random traffic pause (simulate semáforos, tráfico)
    if (this.traffic.shouldPause(this.config.trafficPauseProbability)) {
      vehicle.isPaused = true;
      vehicle.speed = 0;
      vehicle.pauseEndTime = now + this.traffic.pauseDuration() * 1000;
      vehicle.lastUpdateMs = now;
      return;
    }

    // Apply speed variation
    const speedFactor = this.traffic.speedFactor();
    vehicle.speed = Math.max(5, Math.min(45, vehicle.speed * speedFactor));

    // Calculate distance traveled
    const routeLength = this.routeLengths.get(vehicle.routeId);
    if (!routeLength) return;

    const speedMs = vehicle.speed / 3.6; // Convert km/h to m/s
    const distanceM = speedMs * (deltaMs / 1000);
    const progressDelta = distanceM / routeLength;

    const newProgress = vehicle.progress + progressDelta;

    // Check if we're crossing into a gap between segments
    const segments = this.routeSegments.get(vehicle.routeId);
    if (segments && segments.length > 1) {
      // Find current and target segments
      const currentSeg = this.findSegmentForProgress(segments, vehicle.progress);
      const targetSeg = this.findSegmentForProgress(segments, newProgress);

      if (currentSeg && targetSeg && currentSeg !== targetSeg) {
        // Jumping to next segment - snap to its start
        vehicle.progress = targetSeg.startProgress + 0.001;
      } else {
        vehicle.progress = newProgress;
      }
    } else {
      vehicle.progress = newProgress;
    }

    // Route completion: loop back
    if (vehicle.progress >= 0.99) {
      vehicle.progress = 0.02;
      vehicle.speed = this.rng.range(15, 30);
    }

    // Ensure progress stays in valid range
    vehicle.progress = this.snapToValidSegment(vehicle.routeId, vehicle.progress);

    // Update heading
    vehicle.heading = this.calculateHeading(vehicle.routeId, vehicle.progress);

    // Update passengers
    this.updatePassengers(vehicle);

    vehicle.lastUpdateMs = now;
  }

  /** Find which segment contains a given progress value */
  private findSegmentForProgress(segments: SegmentInfo[], progress: number): SegmentInfo | null {
    for (const seg of segments) {
      if (progress >= seg.startProgress && progress <= seg.endProgress) {
        return seg;
      }
    }
    return null;
  }

  private updatePassengers(vehicle: SimulatedVehicle): void {
    // Remove passengers who reached their exit
    vehicle.passengers = vehicle.passengers.filter(
      (p) => vehicle.progress < p.willExitAtProgress
    );

    // Update remaining passengers
    for (const passenger of vehicle.passengers) {
      passenger.progress = vehicle.progress;
      passenger.speed = vehicle.speed;
    }

    // Occasionally add new passengers
    if (this.passengerGen.shouldBoard(0.08) && vehicle.passengers.length < 8) {
      vehicle.passengers.push({
        id: `${vehicle.id}-p${Date.now()}`,
        sessionId: `session-${vehicle.id}-${Date.now()}`,
        routeId: vehicle.routeId,
        progress: vehicle.progress,
        speed: vehicle.speed,
        boardedAt: new Date(),
        willExitAtProgress: this.passengerGen.generateExitProgress(vehicle.progress),
      });
    }
  }

  private generateLocationSamples(): void {
    if (!this.onLocationSample) return;

    for (const vehicle of this.vehicles.values()) {
      const passenger = vehicle.passengers[0];
      if (!passenger || this.rng.bool(this.config.dropSampleProbability)) continue;

      const position = this.getPositionAtProgress(vehicle.routeId, passenger.progress);
      if (!position) continue;

      // Add GPS noise
      const noise = this.gpsNoise.generateNoise(this.config.gpsNoiseMeters);

      const sample: LocationSample = {
        sessionId: passenger.sessionId,
        timestamp: Date.now(),
        lat: position.lat + noise.latOffset,
        lon: position.lon + noise.lonOffset,
        accuracy: this.rng.range(5, 15),
        speed: vehicle.speed / 3.6, // Convert to m/s for API
        heading: vehicle.heading,
        isSimulated: true,
      };

      this.onLocationSample(sample);
    }
  }

  private getPositionAtProgress(routeId: string, progress: number): Coordinates | null {
    const segments = this.routeSegments.get(routeId);
    if (!segments || segments.length === 0) return null;

    const clampedProgress = Math.max(0, Math.min(1, progress));

    // Find which segment contains this progress
    for (const seg of segments) {
      if (clampedProgress >= seg.startProgress && clampedProgress <= seg.endProgress) {
        // Calculate position within this segment
        const segmentProgress = (clampedProgress - seg.startProgress) / (seg.endProgress - seg.startProgress);
        return this.interpolateWithinSegment(seg.points, segmentProgress);
      }
    }

    // Progress is in a gap between segments - find nearest segment
    let nearestSeg = segments[0];
    let minDistance = Infinity;

    for (const seg of segments) {
      const distToStart = Math.abs(clampedProgress - seg.startProgress);
      const distToEnd = Math.abs(clampedProgress - seg.endProgress);

      if (distToStart < minDistance) {
        minDistance = distToStart;
        nearestSeg = seg;
      }
      if (distToEnd < minDistance) {
        minDistance = distToEnd;
        nearestSeg = seg;
      }
    }

    // Return the nearest point of the nearest segment
    if (clampedProgress < nearestSeg.startProgress) {
      const pt = nearestSeg.points[0];
      return { lon: pt[0], lat: pt[1] };
    } else {
      const pt = nearestSeg.points[nearestSeg.points.length - 1];
      return { lon: pt[0], lat: pt[1] };
    }
  }

  /** Interpolate position within a single segment's points */
  private interpolateWithinSegment(points: [number, number][], progress: number): Coordinates | null {
    if (points.length < 2) {
      return points.length === 1 ? { lon: points[0][0], lat: points[0][1] } : null;
    }

    // Calculate total length of this segment
    let totalLength = 0;
    for (let i = 0; i < points.length - 1; i++) {
      totalLength += this.haversineDistance(
        points[i][1], points[i][0],
        points[i + 1][1], points[i + 1][0]
      );
    }

    const targetDistance = totalLength * Math.max(0, Math.min(1, progress));
    let traveled = 0;

    for (let i = 0; i < points.length - 1; i++) {
      const segLen = this.haversineDistance(
        points[i][1], points[i][0],
        points[i + 1][1], points[i + 1][0]
      );

      if (traveled + segLen >= targetDistance || i === points.length - 2) {
        const t = segLen > 0 ? (targetDistance - traveled) / segLen : 0;
        return {
          lon: points[i][0] + (points[i + 1][0] - points[i][0]) * Math.min(1, t),
          lat: points[i][1] + (points[i + 1][1] - points[i][1]) * Math.min(1, t),
        };
      }
      traveled += segLen;
    }

    const lastPt = points[points.length - 1];
    return { lon: lastPt[0], lat: lastPt[1] };
  }

  private calculateHeading(routeId: string, progress: number): number {
    const pos1 = this.getPositionAtProgress(routeId, progress);
    const pos2 = this.getPositionAtProgress(routeId, Math.min(1, progress + 0.005));

    if (!pos1 || !pos2) return 0;

    const dLon = pos2.lon - pos1.lon;
    const dLat = pos2.lat - pos1.lat;

    const heading = (Math.atan2(dLon, dLat) * 180) / Math.PI;
    return (heading + 360) % 360;
  }

  private calculateConfidence(vehicle: SimulatedVehicle): "Alta" | "Media" | "Baja" {
    const ageMs = Date.now() - vehicle.lastUpdateMs;
    const passengerCount = vehicle.passengers.length;

    if (ageMs < 10000 && passengerCount >= 2) return "Alta";
    if (ageMs < 30000 && passengerCount >= 1) return "Media";
    return "Baja";
  }

  private haversineDistance(
    lat1: number, lon1: number,
    lat2: number, lon2: number
  ): number {
    const R = 6371000;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }
}

// Singleton instance
let simulationInstance: SimulationEngine | null = null;

export function getSimulation(config?: Partial<SimulationConfig>): SimulationEngine {
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
