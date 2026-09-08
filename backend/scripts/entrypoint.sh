#!/bin/sh
set -e

echo "╔═══════════════════════════════════════════════════════════╗"
echo "║              MORELIA CONECTA - BACKEND                    ║"
echo "╚═══════════════════════════════════════════════════════════╝"

# Wait for PostgreSQL
echo ""
echo "Waiting for PostgreSQL..."

for i in $(seq 1 30); do
  if bun -e "
    import postgres from 'postgres';
    const sql = postgres(process.env.DATABASE_URL || '');
    try {
      await sql\`SELECT 1\`;
      await sql.end();
      process.exit(0);
    } catch {
      process.exit(1);
    }
  " 2>/dev/null; then
    echo "✓ PostgreSQL is ready"
    break
  fi

  if [ $i -eq 30 ]; then
    echo "⚠ PostgreSQL not available after 30s, continuing anyway..."
  fi

  echo "  Attempt $i/30..."
  sleep 1
done

# Run bootstrap (migrations + data import)
echo ""
echo "Running bootstrap..."
bun run scripts/bootstrap.ts || echo "⚠ Bootstrap completed with warnings"

# Start server
echo ""
echo "Starting server on port ${PORT:-3000}..."
exec bun run src/index.ts
