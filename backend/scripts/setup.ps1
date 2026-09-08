# Morelia Conecta Backend Setup Script (Windows PowerShell)
# Run this after cloning the repository

$ErrorActionPreference = "Stop"

Write-Host @"
╔═══════════════════════════════════════════════════════════╗
║              MORELIA CONECTA - BACKEND SETUP              ║
╚═══════════════════════════════════════════════════════════╝

"@

# Check for Bun
try {
    $bunVersion = bun --version
    Write-Host "✓ Bun $bunVersion found" -ForegroundColor Green
} catch {
    Write-Host "❌ Bun is not installed." -ForegroundColor Red
    Write-Host ""
    Write-Host "Install Bun with:"
    Write-Host "  powershell -c 'irm bun.sh/install.ps1 | iex'"
    exit 1
}

# Check for Docker
try {
    $dockerVersion = docker --version
    Write-Host "✓ Docker found" -ForegroundColor Green
} catch {
    Write-Host "❌ Docker is not installed." -ForegroundColor Red
    Write-Host "Please install Docker Desktop from https://docker.com"
    exit 1
}

# Go to backend directory
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$BackendDir = Split-Path -Parent $ScriptDir
$ProjectDir = Split-Path -Parent $BackendDir
Set-Location $BackendDir

Write-Host ""
Write-Host "Working directory: $BackendDir"

# Install dependencies
Write-Host ""
Write-Host "Installing dependencies..."
bun install

# Check for .env
if (-not (Test-Path ".env")) {
    Write-Host ""
    Write-Host "Creating .env from .env.example..."
    Copy-Item ".env.example" ".env"
    Write-Host "⚠️  Please edit .env and add your GEOAPIFY_API_KEY" -ForegroundColor Yellow
}

# Start PostgreSQL
Write-Host ""
Write-Host "Starting PostgreSQL with PostGIS..."
Set-Location $ProjectDir
docker compose up -d postgres

Write-Host ""
Write-Host "Waiting for PostgreSQL to be ready..."
Start-Sleep -Seconds 5

# Wait for database
$ready = $false
for ($i = 1; $i -le 30; $i++) {
    try {
        $result = docker compose exec -T postgres pg_isready -U morelia -d morelia_conecta 2>&1
        if ($LASTEXITCODE -eq 0) {
            Write-Host "✓ PostgreSQL is ready" -ForegroundColor Green
            $ready = $true
            break
        }
    } catch {}
    Start-Sleep -Seconds 1
}

if (-not $ready) {
    Write-Host "❌ PostgreSQL failed to start" -ForegroundColor Red
    exit 1
}

# Import GeoJSON data
Write-Host ""
Write-Host "Importing GeoJSON data..."
Set-Location $BackendDir
bun run db:import-geojson

Write-Host @"

╔═══════════════════════════════════════════════════════════╗
║                    SETUP COMPLETE                         ║
╚═══════════════════════════════════════════════════════════╝

To start the server:
  cd backend
  bun run dev

Server will be available at http://localhost:3000
WebSocket at ws://localhost:3000/ws/mobility

"@
