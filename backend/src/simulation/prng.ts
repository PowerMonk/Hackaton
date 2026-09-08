// ============================================================================
// Pseudorandom Number Generators
// Ported from /Simulacion Python implementations for deterministic simulation
// ============================================================================

/**
 * Linear Congruential Generator (LCG)
 * Formula: x_{i+1} = (a * x_i + c) mod m
 *
 * Good general-purpose PRNG with configurable parameters.
 * Uses MINSTD parameters by default (Park-Miller).
 */
export class LCG {
  private x: number;
  private readonly a: number;
  private readonly c: number;
  private readonly m: number;

  constructor(
    seed: number,
    a: number = 48271,      // MINSTD multiplier
    c: number = 0,          // c=0 makes it multiplicative
    m: number = 2147483647  // 2^31 - 1 (Mersenne prime)
  ) {
    this.x = Math.abs(seed) || 1;
    this.a = a;
    this.c = c;
    this.m = m;
  }

  /** Generate next value in [0, 1) */
  next(): number {
    this.x = (this.a * this.x + this.c) % this.m;
    return this.x / this.m;
  }

  /** Generate value in [min, max) */
  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  /** Generate integer in [min, max] inclusive */
  int(min: number, max: number): number {
    return Math.floor(this.range(min, max + 1));
  }

  /** Generate boolean with given probability of true */
  bool(probability: number = 0.5): boolean {
    return this.next() < probability;
  }

  /** Pick random element from array */
  pick<T>(arr: T[]): T {
    return arr[this.int(0, arr.length - 1)];
  }

  /** Shuffle array in place (Fisher-Yates) */
  shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = this.int(0, i);
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
}

/**
 * Multiplicative Congruential Generator
 * Formula: x_{i+1} = (a * x_i) mod m
 *
 * Simpler variant of LCG with c=0.
 */
export class MultiplicativeCG {
  private x: number;
  private readonly a: number;
  private readonly m: number;

  constructor(
    seed: number,
    a: number = 16807,      // Classic Park-Miller
    m: number = 2147483647
  ) {
    this.x = Math.abs(seed) || 1;
    this.a = a;
    this.m = m;
  }

  next(): number {
    this.x = (this.a * this.x) % this.m;
    return this.x / this.m;
  }

  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  int(min: number, max: number): number {
    return Math.floor(this.range(min, max + 1));
  }
}

/**
 * Blum Blum Shub Generator
 * Formula: x_{i+1} = x_i^2 mod m
 *
 * Cryptographically stronger but slower.
 * m should be product of two large primes ≡ 3 (mod 4).
 */
export class BlumBlumShub {
  private x: bigint;
  private readonly m: bigint;

  constructor(
    seed: number,
    // Default: product of two primes ≡ 3 (mod 4)
    m: bigint = 50000000000000000017n * 50000000000000000063n
  ) {
    this.x = BigInt(Math.abs(seed) || 1);
    this.m = m;
  }

  next(): number {
    this.x = (this.x * this.x) % this.m;
    return Number(this.x % 1000000n) / 1000000;
  }

  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }
}

/**
 * Additive Congruential Generator
 * Formula: x_i = (x_{i-1} + x_{i-k}) mod m
 *
 * Uses history buffer for longer period.
 */
export class AdditiveCG {
  private history: number[];
  private readonly k: number;
  private readonly m: number;
  private index: number;

  constructor(seed: number, k: number = 5, m: number = 2147483647) {
    this.k = k;
    this.m = m;
    this.index = 0;

    // Initialize history with LCG
    const lcg = new LCG(seed);
    this.history = Array.from({ length: k }, () =>
      Math.floor(lcg.next() * m)
    );
  }

  next(): number {
    const prevIdx = (this.index - 1 + this.k) % this.k;
    const kBackIdx = (this.index - this.k + this.k) % this.k;

    this.history[this.index] =
      (this.history[prevIdx] + this.history[kBackIdx]) % this.m;

    const result = this.history[this.index] / this.m;
    this.index = (this.index + 1) % this.k;

    return result;
  }

  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }
}

/**
 * Quadratic Congruential Generator
 * Formula: x_{i+1} = (a*x_i^2 + b*x_i + c) mod m
 *
 * Higher-order generator with potentially longer period.
 */
export class QuadraticCG {
  private x: number;
  private readonly a: number;
  private readonly b: number;
  private readonly c: number;
  private readonly m: number;

  constructor(
    seed: number,
    a: number = 1,
    b: number = 48271,
    c: number = 1,
    m: number = 2147483647
  ) {
    this.x = Math.abs(seed) || 1;
    this.a = a;
    this.b = b;
    this.c = c;
    this.m = m;
  }

  next(): number {
    this.x = (this.a * this.x * this.x + this.b * this.x + this.c) % this.m;
    return this.x / this.m;
  }

  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }
}

// ============================================================================
// Specialized Generators for Mobility Simulation
// ============================================================================

/**
 * GPS Noise Generator
 * Produces realistic GPS position jitter based on accuracy class.
 */
export class GPSNoiseGenerator {
  private readonly rng: LCG;

  constructor(seed: number) {
    this.rng = new LCG(seed);
  }

  /**
   * Generate noise offset in degrees for given accuracy in meters.
   * Uses Box-Muller transform for normal distribution.
   */
  generateNoise(accuracyMeters: number): { latOffset: number; lonOffset: number } {
    // Box-Muller transform for normal distribution
    const u1 = this.rng.next() || 0.0001;
    const u2 = this.rng.next();

    const mag = Math.sqrt(-2 * Math.log(u1));
    const z0 = mag * Math.cos(2 * Math.PI * u2);
    const z1 = mag * Math.sin(2 * Math.PI * u2);

    // Convert meters to approximate degrees (at Morelia's latitude ~19.7°N)
    // 1 degree lat ≈ 111,320 meters
    // 1 degree lon ≈ 111,320 * cos(19.7°) ≈ 104,860 meters
    const metersPerDegreeLat = 111320;
    const metersPerDegreeLon = 104860;

    // Standard deviation is accuracy/2 (68% within accuracy circle)
    const stdDev = accuracyMeters / 2;

    return {
      latOffset: (z0 * stdDev) / metersPerDegreeLat,
      lonOffset: (z1 * stdDev) / metersPerDegreeLon,
    };
  }
}

/**
 * Traffic Event Generator
 * Simulates traffic conditions, stops, and delays.
 */
export class TrafficGenerator {
  private readonly rng: LCG;

  constructor(seed: number) {
    this.rng = new LCG(seed * 31337);
  }

  /** Should vehicle pause at this tick? */
  shouldPause(baseProb: number = 0.02): boolean {
    return this.rng.bool(baseProb);
  }

  /** Generate pause duration in seconds */
  pauseDuration(): number {
    // Exponential distribution for realistic traffic stops
    // Mean ~30 seconds
    return -30 * Math.log(1 - this.rng.next());
  }

  /** Generate speed variation factor (0.5 to 1.5) */
  speedFactor(): number {
    // Normal-ish distribution centered at 1.0
    const base = (this.rng.next() + this.rng.next() + this.rng.next()) / 3;
    return 0.5 + base;
  }

  /** Generate dwell time at stop in seconds */
  dwellTime(baseSeconds: number = 20): number {
    // Poisson-like variation
    return baseSeconds + this.rng.range(-10, 30);
  }
}

/**
 * Passenger Behavior Generator
 * Simulates passenger boarding and exit patterns.
 */
export class PassengerGenerator {
  private readonly rng: LCG;

  constructor(seed: number) {
    this.rng = new LCG(seed * 7919);
  }

  /** Generate exit progress (where passenger will get off) */
  generateExitProgress(boardingProgress: number): number {
    // Most passengers travel 30-70% of remaining route
    const remaining = 1 - boardingProgress;
    const travelFraction = this.rng.range(0.3, 0.8);
    return boardingProgress + remaining * travelFraction;
  }

  /** Should a new passenger board at this stop? */
  shouldBoard(demand: number = 0.3): boolean {
    return this.rng.bool(demand);
  }

  /** Generate number of passengers boarding at stop */
  boardingCount(avgDemand: number = 2): number {
    // Poisson-ish distribution
    let count = 0;
    let p = Math.exp(-avgDemand);
    let sum = p;
    const r = this.rng.next();

    while (sum < r && count < 10) {
      count++;
      p *= avgDemand / count;
      sum += p;
    }

    return count;
  }
}
