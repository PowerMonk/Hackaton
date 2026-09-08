# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Morelia Conecta** is a Mobility as a Service (MaaS) MVP for Morelia, Michoacan, Mexico. The core concept uses consenting passengers' phones as distributed mobility sensors to provide real-time arrival information for public transit (combis, micros, buses).

**Status:** v0.2 - Flutter mobile UI implemented + Bun/PostGIS backend with simulation engine.

## Commands

### Infrastructure
```bash
docker compose up -d postgres    # Start PostgreSQL/PostGIS
docker compose down              # Stop all services
```

### Backend (Bun)
```bash
cd backend
bun install                      # Install dependencies
bun run dev                      # Run with hot reload (port 3000)
bun run db:import-geojson        # Import routes/stops from GeoJSON
bun run db:seed                  # Seed demo data
bun run simulate                 # Run standalone simulation
bun run typecheck                # TypeScript validation
```

### Mobile (Flutter)
```bash
cd mobile
flutter pub get          # Install dependencies
flutter run              # Run on connected device/emulator
flutter test             # Run widget tests
flutter test test/widget_test.dart  # Run single test file
flutter analyze          # Static analysis
```

### Simulation Scripts (Python - Educational/Read-Only)
```bash
cd Simulacion
python run_algos.py      # Interactive menu for pseudorandom algorithms
```

## Architecture

### Three-Person Ownership Model
1. **Person 1: Mobile UI** (`/mobile`) - Route selection, boarding flow, active trip, trip planner
2. **Person 2: Backend** (`/backend`) - Bun server, PostGIS, mobility engine, simulation
3. **Person 3: Dashboard** (`/dashboard` - not yet created) - React/Vite admin interface

### Backend Structure (`/backend/src/`)
- `index.ts` - Main Bun.serve entry with HTTP + WebSocket
- `routes/handler.ts` - HTTP request routing for all endpoints
- `routes/websocket.ts` - Real-time vehicle/ETA broadcasting
- `services/routes.ts` - PostGIS route/stop queries
- `services/mobility.ts` - Boarding sessions, location processing, ETA
- `services/geocoding.ts` - Geoapify integration with mock fallback
- `services/routing.ts` - OSRM/multimodal route planning
- `simulation/prng.ts` - LCG, Multiplicative, BBS generators (ported from /Simulacion)
- `simulation/engine.ts` - Full vehicle simulation with GPS noise, traffic, passengers
- `db/` - PostgreSQL connection, migrations, seeds

### Mobile Structure (`/mobile/lib/`)
- `main.dart` → `MoreliaConectaApp` → `AppShell` (bottom nav with 3 tabs)
- `screens/` - MapScreen (route selection + demo simulation), PlannerScreen (multimodal planning), TripsScreen, ServiceStatusScreen
- `data/` - `RoutesRepository` loads 124 routes from `assets/geojson/rutas_morelia.geojson`; `DemoData` provides mock data; `DemoSimulation` handles deterministic position interpolation
- `models/` - `TransitRoute`, `StopInfo`, `LocationSample`, `RoutePlanRequest/Response`, `AppMode` (live/demo)
- `theme/app_theme.dart` - Color palette (Ink #1B2738, Cream #F9F4EA, Terracotta #C94C28, Green #176B48, Amber #A87300)
- `widgets/ui_components.dart` - RouteBadge, StatusPill, SoftCard, SelectableRouteCard, etc.

### Data Flow
Route GeoJSON (124 routes) → `RoutesRepository` → `TransitRoute` models → MapScreen displays polylines and route cards → Demo mode uses `DemoSimulation` for deterministic movement along route geometry

### Key Data Files
- `/morelia-rutas/rutas_morelia.geojson` - Full route dataset (OSM-derived, ODbL licensed)
- `/morelia-rutas/paradas_morelia.geojson` - Stop points (39 stops)
- `/mobile/assets/geojson/` - Copies used by Flutter app

## Tech Stack

| Layer | Technology |
|-------|------------|
| Mobile | Flutter/Dart 3.9+, flutter_map, latlong2 |
| Backend | Bun 1.1+, TypeScript, PostgreSQL 16/PostGIS 3.4 |
| Maps | OpenStreetMap tiles (no API key needed) |
| Geocoding | Geoapify (key in `.env`) |
| Routing | OSRM (public demo, self-hosted optional) |
| Container | Docker Compose for PostgreSQL |

## Critical Constraints

- **DEMO_MODE required**: System must work offline without external APIs for hackathon demos
- **OSM Attribution**: All map data requires "© OpenStreetMap contributors" with ODbL license
- **GPS Privacy**: Location access only after explicit user consent (boarding confirmation)
- **Simulation scripts (`/Simulacion/`)**: Educational coursework - treat as read-only, Spanish-language, each script standalone

## API Endpoints (Implemented)

| Endpoint | Description |
|----------|-------------|
| `GET /health` | Server health check |
| `GET /routes` | List all transit routes |
| `GET /routes/:id/vehicles` | Get vehicles on route |
| `GET /stops/:id/eta` | ETA for next vehicle |
| `POST /boarding-sessions` | Start passenger session |
| `POST /locations` | Submit GPS sample |
| `POST /route-plans` | Plan multimodal trip |
| `GET /geocoding/autocomplete?q=` | Address search |
| `GET /dashboard/overview` | System stats |
| `WS /ws/mobility` | Real-time vehicle updates |

## Simulation Engine

The backend includes PRN generators ported from `/Simulacion` (LCG, Multiplicative, Blum-Blum-Shub) to create reproducible demo scenarios:
- Seeded vehicle movement along route polylines
- GPS noise using Box-Muller transform
- Traffic pauses, speed variation, dwell times
- Passenger boarding/exit simulation
- WebSocket broadcasting of vehicle updates

Config via environment: `MOBILITY_MODE=demo`, `SIMULATION_SEED=42`

## Documentation Reference

- `context.md` - Project brief, product modes, technology decisions
- `architecture-reqs.md` - Full API spec, provider decisions, phase breakdown
- `ui-prompt.md` - UI/UX design specification and visual system
- `backend/README.md` - Backend setup and API documentation
