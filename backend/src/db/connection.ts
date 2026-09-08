import { SQL } from "bun";

// Database connection using Bun's native SQL API
const DATABASE_URL =
  process.env.DATABASE_URL ||
  "postgres://morelia:morelia_dev_2024@localhost:5432/morelia_conecta";

// Parse connection string
const url = new URL(DATABASE_URL);

export const db = new SQL({
  hostname: url.hostname,
  port: parseInt(url.port) || 5432,
  username: url.username,
  password: url.password,
  database: url.pathname.slice(1),
});

// Test connection
export async function testConnection(): Promise<boolean> {
  try {
    const result = await db.query`SELECT 1 as test`;
    return result.length > 0;
  } catch (error) {
    console.error("Database connection failed:", error);
    return false;
  }
}

// Helper for transactions
export async function transaction<T>(
  fn: (sql: typeof db) => Promise<T>
): Promise<T> {
  await db.query`BEGIN`;
  try {
    const result = await fn(db);
    await db.query`COMMIT`;
    return result;
  } catch (error) {
    await db.query`ROLLBACK`;
    throw error;
  }
}
