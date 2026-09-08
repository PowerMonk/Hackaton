// ============================================================================
// Route Direction Service
// Derives direction/heading information from route geometry.
// Does NOT invent directions - returns null when data is insufficient.
// ============================================================================

export interface Coordinates {
  lat: number;
  lon: number;
}

export interface DirectionInfo {
  /** Computed heading in degrees (0-360, 0 = North) */
  heading: number;
  /** Human-readable direction (N, NE, E, SE, S, SW, W, NW) */
  cardinal: string;
  /** Spanish label for the direction */
  label: string;
  /** Confidence in the direction calculation */
  confidence: "Alta" | "Media" | "Baja";
  /** True if direction was derived from actual data, false if estimated */
  isDerived: boolean;
}

export interface RouteDirectionInfo {
  /** Direction at the start of the route */
  startDirection: DirectionInfo | null;
  /** Direction at the end of the route */
  endDirection: DirectionInfo | null;
  /** General direction of the route (start to end) */
  overallDirection: DirectionInfo | null;
  /** Origin label if available from data */
  originLabel: string | null;
  /** Destination label if available from data */
  destinationLabel: string | null;
}

const CARDINAL_DIRECTIONS = [
  { min: 337.5, max: 360, label: "Norte", short: "N" },
  { min: 0, max: 22.5, label: "Norte", short: "N" },
  { min: 22.5, max: 67.5, label: "Noreste", short: "NE" },
  { min: 67.5, max: 112.5, label: "Este", short: "E" },
  { min: 112.5, max: 157.5, label: "Sureste", short: "SE" },
  { min: 157.5, max: 202.5, label: "Sur", short: "S" },
  { min: 202.5, max: 247.5, label: "Suroeste", short: "SW" },
  { min: 247.5, max: 292.5, label: "Oeste", short: "W" },
  { min: 292.5, max: 337.5, label: "Noroeste", short: "NW" },
];

/**
 * Convert heading to cardinal direction
 */
export function headingToCardinal(heading: number): { cardinal: string; label: string } {
  const normalized = ((heading % 360) + 360) % 360;

  for (const dir of CARDINAL_DIRECTIONS) {
    if (dir.min <= normalized && normalized < dir.max) {
      return { cardinal: dir.short, label: dir.label };
    }
  }
  // Special case for exactly 360
  if (normalized >= 337.5) {
    return { cardinal: "N", label: "Norte" };
  }

  return { cardinal: "N", label: "Norte" };
}

/**
 * Calculate geodesic bearing between two points
 */
export function calculateBearing(from: Coordinates, to: Coordinates): number {
  const lat1 = (from.lat * Math.PI) / 180;
  const lat2 = (to.lat * Math.PI) / 180;
  const dLon = ((to.lon - from.lon) * Math.PI) / 180;

  const x = Math.sin(dLon) * Math.cos(lat2);
  const y = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);

  let bearing = (Math.atan2(x, y) * 180) / Math.PI;
  return ((bearing % 360) + 360) % 360;
}

/**
 * Calculate direction info between two points
 */
export function calculateDirectionBetweenPoints(
  from: Coordinates,
  to: Coordinates
): DirectionInfo | null {
  // Validate coordinates
  if (!isValidCoordinate(from) || !isValidCoordinate(to)) {
    return null;
  }

  // Check if points are too close (less than ~10m)
  const distance = haversineDistanceM(from, to);
  if (distance < 10) {
    return null;
  }

  const heading = calculateBearing(from, to);
  const { cardinal, label } = headingToCardinal(heading);

  return {
    heading,
    cardinal,
    label,
    confidence: distance > 100 ? "Alta" : "Media",
    isDerived: true,
  };
}

/**
 * Extract direction info from a MultiLineString geometry.
 * Does NOT invent directions - returns null for insufficient data.
 */
export function getRouteDirection(
  coordinates: [number, number][][] | null | undefined,
  routeData?: {
    name?: string;
    originLabel?: string;
    destinationLabel?: string;
  }
): RouteDirectionInfo {
  const result: RouteDirectionInfo = {
    startDirection: null,
    endDirection: null,
    overallDirection: null,
    originLabel: routeData?.originLabel ?? null,
    destinationLabel: routeData?.destinationLabel ?? null,
  };

  if (!coordinates || coordinates.length === 0) {
    return result;
  }

  // Flatten all points
  const allPoints: Coordinates[] = [];
  for (const segment of coordinates) {
    for (const point of segment) {
      if (point.length >= 2) {
        allPoints.push({ lon: point[0], lat: point[1] });
      }
    }
  }

  if (allPoints.length < 2) {
    return result;
  }

  // Calculate start direction (first ~5 points)
  const startSampleSize = Math.min(5, Math.floor(allPoints.length / 4));
  if (startSampleSize >= 2) {
    const startFrom = allPoints[0];
    const startTo = allPoints[startSampleSize - 1];
    result.startDirection = calculateDirectionBetweenPoints(startFrom, startTo);
  }

  // Calculate end direction (last ~5 points)
  const endSampleSize = Math.min(5, Math.floor(allPoints.length / 4));
  if (endSampleSize >= 2) {
    const endFrom = allPoints[allPoints.length - endSampleSize];
    const endTo = allPoints[allPoints.length - 1];
    result.endDirection = calculateDirectionBetweenPoints(endFrom, endTo);
  }

  // Calculate overall direction (start to end)
  result.overallDirection = calculateDirectionBetweenPoints(
    allPoints[0],
    allPoints[allPoints.length - 1]
  );

  // Try to derive origin/destination labels from route name if not provided
  if (!result.originLabel && !result.destinationLabel && routeData?.name) {
    const derived = deriveLabelsFromName(routeData.name);
    if (derived) {
      result.originLabel = derived.origin;
      result.destinationLabel = derived.destination;
    }
  }

  return result;
}

/**
 * Get direction at a specific progress point along the route
 */
export function getDirectionAtProgress(
  coordinates: [number, number][][] | null | undefined,
  progress: number,
  routeLengthM: number
): DirectionInfo | null {
  if (!coordinates || coordinates.length === 0 || routeLengthM <= 0) {
    return null;
  }

  // Flatten all points
  const allPoints: Coordinates[] = [];
  for (const segment of coordinates) {
    for (const point of segment) {
      if (point.length >= 2) {
        allPoints.push({ lon: point[0], lat: point[1] });
      }
    }
  }

  if (allPoints.length < 2) {
    return null;
  }

  const clampedProgress = Math.max(0, Math.min(1, progress));

  // Find the point at the given progress
  let totalLength = 0;
  const segments: { from: Coordinates; to: Coordinates; length: number }[] = [];

  for (let i = 0; i < allPoints.length - 1; i++) {
    const length = haversineDistanceM(allPoints[i], allPoints[i + 1]);
    segments.push({ from: allPoints[i], to: allPoints[i + 1], length });
    totalLength += length;
  }

  const targetDistance = totalLength * clampedProgress;
  let traveled = 0;

  for (const seg of segments) {
    if (traveled + seg.length >= targetDistance || seg === segments[segments.length - 1]) {
      // Found the segment - calculate direction
      return calculateDirectionBetweenPoints(seg.from, seg.to);
    }
    traveled += seg.length;
  }

  return null;
}

/**
 * Try to derive origin/destination from route name.
 * Returns null if pattern not recognized - does NOT invent labels.
 */
function deriveLabelsFromName(name: string): { origin: string; destination: string } | null {
  // Common patterns: "Route A - B", "A → B", "A a B", "A hacia B"
  const patterns = [
    /^(.+?)\s*[-–—]\s*(.+)$/,        // A - B
    /^(.+?)\s*→\s*(.+)$/,             // A → B
    /^(.+?)\s+a\s+(.+)$/i,            // A a B
    /^(.+?)\s+hacia\s+(.+)$/i,        // A hacia B
    /^(.+?)\s+to\s+(.+)$/i,           // A to B
  ];

  for (const pattern of patterns) {
    const match = name.match(pattern);
    if (match && match[1] && match[2]) {
      return {
        origin: match[1].trim(),
        destination: match[2].trim(),
      };
    }
  }

  return null;
}

function isValidCoordinate(coord: Coordinates): boolean {
  return (
    Number.isFinite(coord.lat) &&
    Number.isFinite(coord.lon) &&
    coord.lat >= -90 &&
    coord.lat <= 90 &&
    coord.lon >= -180 &&
    coord.lon <= 180
  );
}

function haversineDistanceM(from: Coordinates, to: Coordinates): number {
  const R = 6371000; // Earth radius in meters
  const dLat = ((to.lat - from.lat) * Math.PI) / 180;
  const dLon = ((to.lon - from.lon) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((from.lat * Math.PI) / 180) *
      Math.cos((to.lat * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Format direction for display in Spanish.
 * Returns null if direction data is insufficient - does NOT invent text.
 */
export function formatDirectionLabel(
  direction: RouteDirectionInfo
): string | null {
  // If we have explicit labels, use them
  if (direction.destinationLabel) {
    return `Hacia ${direction.destinationLabel}`;
  }

  // If we have overall direction, use cardinal
  if (direction.overallDirection) {
    return `Dirección ${direction.overallDirection.label}`;
  }

  // Don't invent - return null
  return null;
}

/**
 * Check if we have enough data to display direction.
 * Use this before showing direction UI elements.
 */
export function hasValidDirection(direction: RouteDirectionInfo): boolean {
  return (
    direction.overallDirection !== null ||
    direction.destinationLabel !== null ||
    direction.originLabel !== null
  );
}
