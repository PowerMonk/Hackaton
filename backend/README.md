# Morelia Conecta Backend

Bun + TypeScript + PostgreSQL/PostGIS backend for the Morelia Conecta MaaS MVP.

## Quick Start

### Prerequisites

- [Bun](https://bun.sh/) v1.1+
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (for PostgreSQL/PostGIS)

### Setup

1. Start the database:
```bash
# From project root
docker compose up -d postgres
```

2. Install dependencies:
```bash
cd backend
bun install
```

3. Configure environment:
```bash
cp .env.example .env
# Edit .env with your GEOAPIFY_API_KEY
```

4. Import GeoJSON data:
```bash
bun run db:import-geojson
```

5. Start the server:
```bash
bun run dev
```

Server will be available at http://localhost:3000

## API Endpoints

### Health & Info
- `GET /health` - Server health check

### Routes
- `GET /routes` - List all routes
- `GET /routes/:id` - Get route by ID
- `GET /routes/:id/vehicles` - Get vehicles on route

### Stops
- `GET /stops` - List all stops
- `GET /stops/:id` - Get stop by ID
- `GET /stops/:id/eta` - Get ETA for next vehicle

### Boarding Sessions
- `POST /boarding-sessions` - Start boarding session
- `DELETE /boarding-sessions/:id` - End session
- `GET /boarding-sessions` - List active sessions

### Location Tracking
- `POST /locations` - Submit GPS sample

### Route Planning
- `POST /route-plans` - Plan multimodal route

### Geocoding
- `GET /geocoding/autocomplete?q=...` - Address search
- `GET /geocoding/reverse?lat=...&lon=...` - Reverse geocode

### Dashboard
- `GET /dashboard/overview` - System overview
- `GET /dashboard/vehicles` - All active vehicles
- `GET /dashboard/stops` - Stop status

### WebSocket
- `WS /ws/mobility` - Real-time vehicle updates

## Simulation

The backend includes a simulation engine that generates realistic vehicle movement for demo mode.

```bash
# Run standalone simulation
bun run simulate

# With custom seed and speed
bun run simulate 12345 5  # seed=12345, 5x speed
```

## Development

```bash
# Run with hot reload
bun run dev

# Type check
bun run typecheck

# Run database migrations
bun run db:migrate

# Seed demo data
bun run db:seed
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgres://morelia:morelia_dev_2024@localhost:5432/morelia_conecta` |
| `GEOAPIFY_API_KEY` | Geoapify API key for geocoding | (required for geocoding) |
| `OSRM_BASE_URL` | OSRM server URL | `https://router.project-osrm.org` |
| `PORT` | Server port | `3000` |
| `HOST` | Server host | `0.0.0.0` |
| `MOBILITY_MODE` | `demo` or `live` | `demo` |
| `SIMULATION_SEED` | RNG seed for reproducible demos | `42` |

## Architecture

```
src/
├── index.ts           # Main server entry
├── routes/
│   ├── handler.ts     # HTTP request routing
│   └── websocket.ts   # WebSocket handlers
├── services/
│   ├── routes.ts      # Route/stop data access
│   ├── mobility.ts    # Boarding, location, ETA
│   ├── geocoding.ts   # Geoapify integration
│   └── routing.ts     # OSRM/route planning
├── simulation/
│   ├── prng.ts        # Pseudo-random generators
│   ├── engine.ts      # Simulation engine
│   └── runner.ts      # Standalone runner
├── db/
│   ├── connection.ts  # Database connection
│   ├── migrate.ts     # Migration runner
│   └── seed.ts        # Demo data seeder
└── types/
    └── index.ts       # TypeScript types
```
