# Morelia Conecta Backend

Bun + TypeScript + PostgreSQL/PostGIS backend for the Morelia Conecta MaaS MVP.

## Quick Start (Docker)

The easiest way to run everything:

```bash
# From project root
docker compose up --build
```

This will:
1. Start PostgreSQL with PostGIS
2. Run migrations automatically
3. Import GeoJSON route data
4. Start the API server with simulation

Server available at: http://localhost:3000

## Local Development

### Prerequisites
- [Bun](https://bun.sh/) v1.1+
- [Docker](https://www.docker.com/) (for PostgreSQL)

### Setup

```bash
# Start only PostgreSQL
docker compose up -d postgres

# Install dependencies
cd backend
bun install

# Configure (optional)
cp .env.example .env

# Run bootstrap (migrations + data import)
bun run bootstrap

# Start development server
bun run dev
```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Server health + DB status |
| `/routes` | GET | List all routes |
| `/routes/:id` | GET | Get route details |
| `/routes/:id/vehicles` | GET | Get vehicles on route |
| `/stops` | GET | List all stops |
| `/stops/:id/eta` | GET | ETA for next vehicle |
| `/boarding-sessions` | POST | Start boarding session |
| `/boarding-sessions/:id` | DELETE | End session |
| `/locations` | POST | Submit GPS sample |
| `/route-plans` | POST | Plan multimodal trip |
| `/geocoding/autocomplete` | GET | Address search |
| `/vehicles` | GET | All simulated vehicles |
| `/dashboard/overview` | GET | System statistics |
| `/ws/mobility` | WS | Real-time updates |

## Connecting from Android

### Same WiFi network
```
http://YOUR_PC_IP:3000
```

Get your IP with `ipconfig` (Windows) or `ip addr` (Linux).

### Android Emulator
```
http://10.0.2.2:3000
```

### USB with ADB
```bash
adb reverse tcp:3000 tcp:3000
# Then use http://127.0.0.1:3000
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | (see .env.example) | PostgreSQL connection |
| `GEOAPIFY_API_KEY` | - | Geocoding API key |
| `OSRM_BASE_URL` | public demo | Street routing server |
| `PORT` | 3000 | Server port |
| `MOBILITY_MODE` | demo | `demo` or `live` |
| `SIMULATION_SEED` | 42 | Reproducible demos |

## Project Structure

```
backend/
├── src/
│   ├── index.ts           # Server entry
│   ├── routes/
│   │   ├── handler.ts     # HTTP routing
│   │   └── websocket.ts   # Real-time updates
│   ├── services/
│   │   ├── routes.ts      # Route/stop queries
│   │   ├── mobility.ts    # Sessions, GPS, ETA
│   │   ├── geocoding.ts   # Geoapify + fallback
│   │   └── routing.ts     # OSRM + fallback
│   ├── simulation/
│   │   ├── prng.ts        # LCG, BBS generators
│   │   └── engine.ts      # Vehicle simulation
│   ├── db/
│   │   └── connection.ts  # PostgreSQL client
│   └── types/
│       └── index.ts       # TypeScript types
├── db/init/               # SQL migrations
├── scripts/
│   ├── bootstrap.ts       # Auto-setup script
│   └── entrypoint.sh      # Docker entrypoint
├── Dockerfile
└── package.json
```

## Simulation

The backend runs a simulation engine in demo mode:
- Creates 2 vehicles per route
- Moves vehicles along polylines at 15-30 km/h
- Generates GPS samples with realistic noise
- Broadcasts updates via WebSocket

All using seeded PRNGs for reproducibility.
