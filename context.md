# Morelia Mobility MVP Context

## Purpose

This repository will contain a software-only Mobility as a Service MVP for Morelia, Michoacan.

The primary problem is the lack of reliable, current information about the location and arrival time of public transportation, especially buses and vans. The core innovation is to use consenting passengers' phones as distributed mobility sensors.

The product must demonstrate:

```text
Passenger selects a route
    -> nearby vehicle is detected
    -> passenger confirms boarding
    -> phone sends low-frequency GPS samples
    -> backend matches movement to the route
    -> users are grouped into a virtual vehicle
    -> other passengers receive an ETA
```

The official challenge PDF is the source of truth for the problem context. Announced infrastructure figures that may change must be labeled as provisional. The MVP must not claim access to official vehicle GPS or operator APIs unless those sources are actually provided.

## Explicitly Out Of Scope

The product does not include:

- Public transport cards.
- RFID or NFC.
- Fare collection or balance management.
- Payment processing.
- Card readers or validators.
- Card cryptography.
- Hardware installed in vehicles.
- Enterprise authentication.
- Personal profiles.

Fares may appear only as configurable estimates for route-planning demonstrations. They are not connected to a payment system.

## Product Modes

The app has two modes:

- `LIVE_MODE`: uses real Android GPS after a passenger confirms boarding.
- `DEMO_MODE`: replays deterministic simulated users and locations through the same backend APIs.

The demo mode is mandatory because the presentation cannot depend on real passengers, network quality or accurate GPS at the venue.

## Technology Decisions

### Mobile

- Flutter and Dart.
- Android first.
- iOS support after the hackathon because the team has no Mac available.
- The UI must not depend directly on the location plugin.
- Location access begins only after explicit boarding confirmation.

### Backend

- Bun runtime.
- Pure `Bun.serve` for HTTP and WebSockets.
- TypeScript.
- Bun native `SQL` API for PostgreSQL.
- No Express or Node.js runtime requirement.

### Data

- PostgreSQL as the system of record.
- PostGIS for routes, stops, points, proximity and route matching.
- Docker Compose for local PostgreSQL/PostGIS development.
- GTFS and GeoJSON files will be provided inside the repository.
- External Google Maps APIs are optional adapters, not critical dependencies.

### Dashboard

- React, Vite and TypeScript.
- Operational map, inferred vehicles, demand and service indicators.

## Three-Person Ownership

### Person 1: Flutter Mobile Product

Owns `/mobile`.

Responsibilities:

- Map and route selection.
- Optional direction filter.
- Nearby vehicle prompt.
- Boarding confirmation.
- Active boarding session UI.
- ETA and stop details.
- Multimodal route-planning UI.
- Android permissions.
- Adaptive sampling integration.
- Offline and error states.

### Person 2: Bun Backend, PostGIS and Mobility Engine

Owns `/backend` and `/database`.

Responsibilities:

- HTTP and WebSocket server.
- PostgreSQL migrations.
- PostGIS queries.
- Location ingestion.
- Boarding sessions.
- Route matching.
- Mobility state classification.
- Virtual vehicle clustering.
- ETA calculation.
- Route-planning API.
- Data retention and aggregation.

### Person 3: GTFS, Simulation, Dashboard and Demo

Owns `/data`, `/dashboard`, `/shared` and `/docs`.

Responsibilities:

- GTFS import and normalization.
- GeoJSON generation.
- Simulation engine and replay scenarios.
- Seeded random variation.
- Dashboard.
- Demo scripts and fixtures.
- Metrics and documentation.

## Mobile User Flow

```text
Home
    -> select a route
    -> map filters to that route
    -> optional direction selection
    -> nearby vehicle notification
    -> "Did you board?"
    -> passenger confirms
    -> active trip mode
    -> GPS samples are sent
    -> trip ends automatically or manually
    -> ETA remains available for selected stops
```

Selecting a destination is optional. Selecting only a route is valid, even when multiple routes share the same street.

The boarding prompt must have a cooldown so it does not repeatedly interrupt the user. Suggested actions:

- `Ya estoy a bordo`.
- `No subí`.
- `Ahora no`.

## Automatic Trip Completion

Do not end a trip just because the phone is stationary. Traffic can produce repeated locations while the passenger is still onboard.

End or pause a session when:

- The user presses `Bajarme`.
- The user leaves the route corridor and shows a walking pattern for multiple samples.
- The user remains near a stop and then moves away from the route as a pedestrian.
- No valid location is available for a configurable timeout.

No valid location should initially pause the session and reduce confidence rather than immediately deleting the vehicle observation.

## Adaptive GPS Policy

Initial policy:

```text
Normal onboard movement: every 30 seconds
Less than 10 meters of movement twice: every 60 seconds
Continued inactivity: up to 120 seconds
Detected route progress: return to 15-30 seconds
```

Exact coordinate equality must not be used as the only signal. Use distance, reported speed, accuracy and progress along the route.

## Backend Pipeline

```text
POST /locations
    -> request validation
    -> timestamp and accuracy filters
    -> duplicate and impossible-speed filters
    -> PostgreSQL/PostGIS persistence
    -> route candidate lookup
    -> route projection and progress
    -> mobility state update
    -> virtual vehicle update
    -> ETA calculation
    -> WebSocket broadcast
```

The system should use spatial indexes and query only routes within a corridor. It must not compare every point against every route in application code.

## Mobility States

```text
IDLE
WALKING
WAITING
IN_TRANSIT
UNKNOWN
```

`IN_TRANSIT` requires several recent samples, consistent route matching, compatible direction, movement compatible with public transport and enough confidence.

## Virtual Vehicles

Passengers may be grouped when they have:

- The same matched route.
- Similar progress, initially within approximately 100-150 meters.
- Similar speed, initially within approximately 10 km/h.
- Compatible heading.
- Recent samples.

The output is an inferred virtual vehicle, not an official physical vehicle identity.

## ETA

```text
ETA = remaining route distance / smoothed speed + expected stop dwell time
```

Use recent median or trimmed-mean speeds, not one noisy GPS reading. Include a confidence score and stale-data state. Low-confidence results should use a range such as `4-6 min` rather than false precision.

## Route Planning

The first planner should support:

- Walking to a stop.
- Public transport.
- Walking plus public transport.
- Optional bicycle or other non-motorized alternatives when the data supports them.

Ranking preferences:

- Fastest.
- Cheapest.
- Least walking.
- Fewest transfers.

The first planner will use local GTFS and PostGIS data. Walking distance may use a configurable approximation until an external routing provider is available. Google Maps integration may be added behind an adapter if an API key and budget become available.

Useful GTFS data includes:

```text
routes
stops
trips
stop_times
calendar
calendar_dates
shapes
transfers
```

## API Surface

```http
GET /health
GET /routes
GET /routes/:routeId
GET /routes/:routeId/vehicles
GET /stops/:stopId
POST /locations
POST /boarding-sessions
DELETE /boarding-sessions/:sessionId
GET /stops/:stopId/eta
POST /route-plans
GET /dashboard/overview
GET /dashboard/vehicles
GET /dashboard/stops
WS /ws/mobility
```

## Simulation Context From `/Simulacion`

The existing `Simulacion` folder is an educational Python repository and must remain read-only from the mobility project.

It contains implementations of:

- Middle-square generation.
- Middle-product generation.
- Constant multiplier generation.
- Linear congruential generation.
- Multiplicative congruential generation.
- Additive congruential generation.
- Quadratic congruential generation.
- Blum, Blum and Shub generation.

The generated values are normalized to approximately `[0, 1]` and are used to represent random variables in simulation exercises. The `T3` folder contains statistical checks for means, variance, Kolmogorov-Smirnov uniformity, independence by runs, series and gaps.

The mobility simulator may borrow the following ideas:

- Explicit seeds for repeatable scenarios.
- Reproducible pseudo-random variation.
- Distribution checks for generated noise.
- Separate generation and validation steps.

The mobility simulator should not treat these classroom implementations as cryptographic randomness. It should use a seeded generator to create GPS noise, speed variation, dwell time, delays, dropped samples and traffic events so the demo is repeatable.

## Simulation Requirements

The simulator must send events through the same public flow as the mobile app:

```text
simulation replay
    -> POST /boarding-sessions
    -> POST /locations
    -> matching
    -> clustering
    -> ETA
    -> dashboard and mobile UI
```

Scenarios should include:

- Several users boarding the same route.
- Different speeds.
- GPS noise.
- Traffic pauses.
- Stop dwell time.
- Dropped samples.
- A stale user.
- A route with multiple vehicles.
- Increasing demand at a stop.

Simulation speed should support `1x`, `5x` and `10x` replay.

## Persistence Policy

- Raw GPS samples: short retention, initially 24-72 hours.
- Boarding sessions: retain for debugging and aggregate analysis.
- Route matches: aggregate where possible.
- Stop demand: retain by stop and time bucket.
- Segment speeds: retain by route segment and time bucket.
- ETA accuracy: retain as aggregate performance data.
- No permanent identifiable passenger trajectory.

## Critical Path

```text
Route data
    -> mobile route selection
    -> boarding confirmation
    -> GPS ingestion
    -> PostGIS matching
    -> virtual vehicle
    -> ETA
    -> Flutter visualization
```

Multimodal planning and dashboard intelligence are important, but they must not delay this flow.

## Current Implementation Status

Current repository status:

- Flutter mobile UI scaffold exists under `/mobile`.
- Android and iOS platform scaffolding exists; Android is the first target.
- The UI currently uses local mock data and is not connected to the backend.
- `flutter_map` with OpenStreetMap tiles is used as the map adapter for the UI phase.
- The mobile UI includes Home, route selection, focused route map, boarding prompt, active trip, planner, trips and service-status states.
- Widget tests cover route selection, navigation, planner editing and compact-screen layout.
- The backend, GPS service, Bun API, PostgreSQL and PostGIS are not implemented yet.
- The official challenge PDF was available at the repository root.
- The simulation coursework was available under `/Simulacion`.
- GTFS and GeoJSON project data had not yet been added.

The next work should connect the stable UI interfaces to the Bun/PostGIS project foundation, while keeping the API and shared data contracts stable.
