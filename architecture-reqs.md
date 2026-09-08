# Morelia Conecta Architecture Requirements

## Goal

Build a software-only mobility MVP for Morelia that can:

```text
User selects a route
    -> user sees the route on a map
    -> nearby vehicle is detected
    -> user confirms boarding
    -> phone contributes low-frequency GPS samples
    -> backend matches movement to a transit route
    -> users are grouped into an inferred virtual vehicle
    -> passengers receive an ETA
```

The system must clearly distinguish between:

- Official data.
- OpenStreetMap-derived provisional data.
- Crowdsourced observations.
- Simulated demo data.
- Estimated values.

The project does not include public transport cards, payment, RFID, NFC, fare collection, card readers or card cryptography.

## Technology Stack

### Mobile

- Flutter and Dart.
- Android first.
- iOS platform scaffolding is present, but iOS implementation comes after the hackathon.
- `flutter_map` for map rendering.
- OpenStreetMap raster tiles for the map base.
- `latlong2` for coordinates and local geometry operations.
- A location plugin will be introduced behind a `LocationService` interface.

Current UI-only dependencies:

```text
flutter_map
latlong2
```

The UI must not directly depend on a GPS plugin or a geocoding provider.

### Backend

- Bun runtime.
- TypeScript.
- Pure `Bun.serve` for HTTP and WebSockets.
- Bun native `SQL` API for PostgreSQL.
- No Express or Node.js runtime requirement.
- REST for request/response flows.
- WebSocket for mobility state updates.

### Database

- PostgreSQL.
- PostGIS.
- Docker Compose for local development.
- PostgreSQL is the system of record.
- PostGIS is responsible for spatial queries, route corridors, points, nearest geometry and projections.

### Dashboard

- React.
- Vite.
- TypeScript.
- The dashboard consumes backend APIs and does not duplicate mobility algorithms.

## Map Provider

### Primary Map

Use OpenStreetMap tiles through `flutter_map`.

Requirements:

- Keep visible OSM attribution.
- Set an identifying user agent/package name.
- Do not treat public tile servers as an unlimited production dependency.
- Add tile fallback and a local visual fallback for poor connectivity.

API key required:

```text
No
```

The map is only the visual layer. It does not calculate street routes by itself.

## Address Search And Geocoding

### Primary Provider: Geoapify

Use Geoapify for:

- Address autocomplete.
- Place search.
- Forward geocoding.
- Reverse geocoding when the user selects their current location.

Relevant capability:

```text
GET /v1/geocode/autocomplete
```

Geoapify requires an API key for its APIs.

Required environment variable:

```text
GEOAPIFY_API_KEY
```

The key must only exist on the Bun backend. It must not be bundled into Flutter or committed to Git.

Recommended flow:

```text
Flutter TextField
    -> Bun /geocoding/autocomplete
    -> Geoapify
    -> normalized AddressSuggestion
    -> Flutter suggestion list
    -> selected lat/lon stored in planner state
```

The app must not send only free-form text to the route planner. It must send selected coordinates and a display label.

Suggested type:

```typescript
type AddressSuggestion = {
  id: string;
  label: string;
  lat: number;
  lon: number;
  city?: string;
  category?: string;
};
```

### Fallback Geocoder

For development without a key:

- Use local mock suggestions.
- Cache previously selected Morelia locations.
- Optionally use Nominatim for low-volume development queries.

Nominatim is not the primary production dependency because its public service has strict usage policies and no guaranteed availability for a hackathon demo.

## Street Routing

### Primary Provider: OSRM

Use OSRM for road-network calculations outside the public transport graph:

- Walking legs.
- Bicycle legs.
- Street distance.
- Street duration.
- Snapping a coordinate to a road.
- Optional GPS trace matching.

Relevant services:

```text
/route/v1/{profile}/{coordinates}
/table/v1/{profile}/{coordinates}
/nearest/v1/{profile}/{coordinate}
/match/v1/{profile}/{coordinates}
```

OSRM auto-hosted locally requires no API key. It does require an OSM `.osm.pbf` extract and generated routing data.

Required local infrastructure:

```text
OSM PBF extract for Morelia or Michoacan
OSRM Docker container
OSRM profile for walking, bicycle or driving as needed
```

The current `morelia-rutas` GeoJSON is not sufficient to build a complete street-routing graph. It contains transit route geometries, not the entire walkable road network.

### OSRM Public Demo

The public OSRM server may be used for initial low-volume experiments only.

It must not be treated as a guaranteed demo dependency because it has:

- No project SLA.
- Rate limits.
- Shared infrastructure.
- Possible availability changes.

The backend must expose a provider interface so OSRM can later be replaced by Geoapify Routing, OpenRouteService, Google Routes or another provider.

## Optional Street Routing Providers

### Geoapify Routing

Geoapify can also calculate walking, bicycle and driving routes.

API key required:

```text
Yes: GEOAPIFY_API_KEY
```

Use it as an alternative to self-hosted OSRM when infrastructure time is more important than eliminating third-party routing calls.

Do not call both Geoapify Routing and OSRM for the same request by default. Select one provider through configuration.

### Google Routes

Google Routes and Places can be added as an optional adapter if the team provides:

- Google Cloud project.
- Billing-enabled account.
- Restricted API key.
- Enabled Places and Routes APIs.

Google is not required for the MVP and must not become the critical path.

## Public Transport Data

### Current Provisional Source

The repository contains an OpenStreetMap-derived dataset under:

```text
/morelia-rutas
```

Current data:

- 124 route geometries.
- 39 stop points.
- 103 named route features.
- 21 unnamed/provisional route features.
- ODbL attribution requirements.

This is useful for map display and a demo, but it is not official GTFS and must be labeled provisional.

### GTFS Static

GTFS is required for reliable public transport planning.

Minimum files:

```text
agency.txt
routes.txt
trips.txt
stops.txt
stop_times.txt
calendar.txt
calendar_dates.txt
```

Useful optional files:

```text
shapes.txt
transfers.txt
frequencies.txt
fare_attributes.txt
fare_rules.txt
```

GTFS does not require an API key. It is normally supplied as a ZIP feed or a local directory.

Required future flow:

```text
GTFS ZIP
    -> validation
    -> normalization
    -> PostgreSQL/PostGIS import
    -> route planner
```

### GTFS Realtime

GTFS Realtime defines:

- `VehiclePosition`.
- `TripUpdate`.
- `ServiceAlert`.

There is currently no confirmed Morelia GTFS Realtime feed in the project. The MVP will generate inferred vehicle state from consenting passenger phones instead.

Future output adapters may expose the inferred state as synthetic GTFS Realtime `VehiclePosition` data.

## PostgreSQL/PostGIS Responsibilities

PostGIS must handle:

- Route geometries.
- Route segments.
- Stop points.
- Route-stop relationships.
- Accepted GPS samples.
- Spatial indexes.
- Route corridor queries.
- Nearest route segment.
- Progress along route.
- Nearby vehicles.
- Origin and destination stop searches.

Suggested spatial operations:

```text
ST_DWithin
ST_Distance
ST_ClosestPoint
ST_LineLocatePoint
ST_LineInterpolatePoint
```

The app must not compare every GPS point against every route in Dart or TypeScript.

## Backend APIs

Required initial endpoints:

```http
GET /health
GET /routes
GET /routes/:routeId
GET /routes/:routeId/vehicles
GET /stops/:stopId
GET /stops/:stopId/eta
POST /boarding-sessions
DELETE /boarding-sessions/:sessionId
POST /locations
POST /route-plans
GET /dashboard/overview
GET /dashboard/vehicles
GET /dashboard/stops
WS /ws/mobility
```

Additional provider-backed endpoints:

```http
GET /geocoding/autocomplete?q=...
GET /geocoding/reverse?lat=...&lon=...
POST /street-routes
```

Third-party API calls must be made by Bun, not directly by Flutter.

## Environment Variables

Development `.env` values may include:

```text
DATABASE_URL=postgres://...
GEOAPIFY_API_KEY=...
OSRM_BASE_URL=http://localhost:5000
GTFS_DATA_DIR=...
MOBILITY_MODE=demo
```

Rules:

- `.env` is never committed.
- `.env.example` may be committed with placeholder values.
- API keys must be restricted where the provider supports restrictions.
- Mobile builds must never contain server-side provider keys.
- The backend must continue operating in `DEMO_MODE` without third-party keys.

## Data Contracts

### Location Sample

```typescript
type LocationSample = {
  sessionId: string;
  timestamp: number;
  lat: number;
  lon: number;
  accuracy: number;
  speed?: number;
  heading?: number;
};
```

### Route Plan Request

```typescript
type RoutePlanRequest = {
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
  priority: "fastest" | "cheapest" | "least_walking" | "fewest_transfers";
  modes: Array<"walk" | "transit" | "bicycle">;
};
```

### Street Route Result

```typescript
type StreetRoute = {
  distanceMeters: number;
  durationSeconds: number;
  geometry: GeoJSON.LineString;
  provider: "osrm" | "geoapify" | "google" | "mock";
  estimated: boolean;
};
```

## Implementation Phases

### Phase 0: UI Polish

- Compact route cards.
- Sticky route header.
- Floating map button.
- General map with no selected route.
- Real route map when a route is selected.
- Smaller stop sequence.
- Empty stop state when data is unavailable.
- Compact trip-history cards.
- Responsive planner heading.

### Phase 1: Dataset Normalization

- Preserve stable source route IDs.
- Preserve MultiLineString segments.
- Validate geometry continuity.
- Build route-stop relationships.
- Add route sequence and source metadata.
- Add a dataset manifest.
- Keep unnamed routes marked provisional.

### Phase 2: Backend Foundation

- Bun server.
- PostgreSQL/PostGIS Docker Compose setup.
- Migrations.
- Route and stop import.
- Health endpoint.
- Routes and stops endpoints.
- In-memory active-state cache.

### Phase 3: Address Selection

- Define `GeocodingProvider`.
- Implement local mock suggestions.
- Add Geoapify autocomplete through Bun.
- Cache frequent Morelia queries.
- Store selected coordinates in planner state.

### Phase 4: Street Routing

- Define `StreetRoutingProvider`.
- Start with OSRM.
- Add walking and bicycle legs.
- Cache route results.
- Add fallback estimates when OSRM is unavailable.

### Phase 5: Localized Transit Planning

- Import GTFS when available.
- Otherwise generate explicitly provisional transit metadata.
- Find origin and destination stops.
- Build walking plus transit alternatives.
- Rank by time, walking, transfers and estimated cost.

### Phase 6: Boarding And Location

- Add real Android location service.
- Request permission only after user intent.
- Create boarding session after confirmation.
- Adaptive sampling.
- Offline queue.
- POST location samples to Bun.

### Phase 7: Mobility Engine

- Validate samples.
- Match points to route corridors.
- Classify mobility state.
- Estimate progress and speed.
- Cluster users into virtual vehicles.
- Calculate confidence-aware ETA.

### Phase 8: Demo And Dashboard

- Simulator uses the same public API.
- Seeded GPS noise.
- Multiple virtual passengers.
- Traffic pauses and dropped samples.
- Dashboard map and KPIs.
- Demand and saturation estimates.

## MVP Provider Decision

The recommended initial provider stack is:

```text
Map display: OpenStreetMap + flutter_map
Address autocomplete: Geoapify
Street routing: OSRM self-hosted
Transit planning: local GTFS + PostGIS
Transit vehicle state: crowdsourced GPS + Mobility Engine
Database: PostgreSQL + PostGIS
Backend: Bun + TypeScript
```

Required key for the recommended stack:

```text
GEOAPIFY_API_KEY
```

OSRM does not require a key when self-hosted, but it requires an OSM road-network extract and routing preprocessing.

The full application must still run in `DEMO_MODE` without Geoapify, OSRM, GTFS Realtime or Google credentials.
