// ============================================================================
// Database Connection
// Uses postgres package for PostgreSQL/PostGIS
// ============================================================================

import postgres from "postgres";

const DATABASE_URL =
  process.env.DATABASE_URL ||
  "postgres://morelia:morelia_dev_2024@localhost:5432/morelia_conecta";

// Create connection pool
export const sql = postgres(DATABASE_URL, {
  max: 10,
  idle_timeout: 30,
  connect_timeout: 10,
  types: {
    // Handle PostGIS geometry as JSON
    geometry: {
      to: 1,
      from: [17],
      serialize: (x: unknown) => JSON.stringify(x),
      parse: (x: string) => x,
    },
  },
});

// Test connection
export async function testConnection(): Promise<boolean> {
  try {
    const result = await sql`SELECT 1 as test`;
    return result.length > 0;
  } catch (error) {
    console.error("Database connection failed:", error);
    return false;
  }
}

// Check if tables exist
export async function checkSchema(): Promise<{
  routes: boolean;
  stops: boolean;
  sessions: boolean;
  vehicles: boolean;
}> {
  try {
    const tables = await sql`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN ('routes', 'stops', 'boarding_sessions', 'virtual_vehicles')
    `;

    const tableNames = new Set(tables.map((t) => t.table_name));

    return {
      routes: tableNames.has("routes"),
      stops: tableNames.has("stops"),
      sessions: tableNames.has("boarding_sessions"),
      vehicles: tableNames.has("virtual_vehicles"),
    };
  } catch (error) {
    console.error("Schema check failed:", error);
    return { routes: false, stops: false, sessions: false, vehicles: false };
  }
}

// Get table counts for health check
export async function getTableCounts(): Promise<{
  routes: number;
  stops: number;
  sessions: number;
  vehicles: number;
}> {
  try {
    const [routes] = await sql`SELECT COUNT(*) as count FROM routes`;
    const [stops] = await sql`SELECT COUNT(*) as count FROM stops`;
    const [sessions] = await sql`SELECT COUNT(*) as count FROM boarding_sessions WHERE ended_at IS NULL`;
    const [vehicles] = await sql`SELECT COUNT(*) as count FROM virtual_vehicles`;

    return {
      routes: Number(routes?.count || 0),
      stops: Number(stops?.count || 0),
      sessions: Number(sessions?.count || 0),
      vehicles: Number(vehicles?.count || 0),
    };
  } catch (error) {
    return { routes: 0, stops: 0, sessions: 0, vehicles: 0 };
  }
}

// Close connection pool
export async function closeConnection(): Promise<void> {
  await sql.end();
}
