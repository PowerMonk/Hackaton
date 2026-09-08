#!/bin/bash
# Morelia Conecta Backend Setup Script
# Run this after cloning the repository

set -e

echo "╔═══════════════════════════════════════════════════════════╗"
echo "║              MORELIA CONECTA - BACKEND SETUP              ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo ""

# Check for Bun
if ! command -v bun &> /dev/null; then
    echo "❌ Bun is not installed."
    echo ""
    echo "Install Bun with:"
    echo "  curl -fsSL https://bun.sh/install | bash"
    echo ""
    exit 1
fi

echo "✓ Bun $(bun --version) found"

# Check for Docker
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed."
    echo "Please install Docker Desktop from https://docker.com"
    exit 1
fi

echo "✓ Docker $(docker --version | cut -d' ' -f3 | tr -d ',') found"

# Go to backend directory
cd "$(dirname "$0")/.."
echo ""
echo "Working directory: $(pwd)"

# Install dependencies
echo ""
echo "Installing dependencies..."
bun install

# Check for .env
if [ ! -f .env ]; then
    echo ""
    echo "Creating .env from .env.example..."
    cp .env.example .env
    echo "⚠️  Please edit .env and add your GEOAPIFY_API_KEY"
fi

# Start PostgreSQL
echo ""
echo "Starting PostgreSQL with PostGIS..."
cd ..
docker compose up -d postgres

echo ""
echo "Waiting for PostgreSQL to be ready..."
sleep 5

# Check database
for i in {1..30}; do
    if docker compose exec -T postgres pg_isready -U morelia -d morelia_conecta &> /dev/null; then
        echo "✓ PostgreSQL is ready"
        break
    fi
    if [ $i -eq 30 ]; then
        echo "❌ PostgreSQL failed to start"
        exit 1
    fi
    sleep 1
done

# Import GeoJSON data
echo ""
echo "Importing GeoJSON data..."
cd backend
bun run db:import-geojson

echo ""
echo "╔═══════════════════════════════════════════════════════════╗"
echo "║                    SETUP COMPLETE                         ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo ""
echo "To start the server:"
echo "  cd backend && bun run dev"
echo ""
echo "Server will be available at http://localhost:3000"
echo "WebSocket at ws://localhost:3000/ws/mobility"
echo ""
