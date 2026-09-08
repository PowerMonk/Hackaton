// ============================================================================
// Database Migration Runner
// Applies SQL migrations from db/init directory
// ============================================================================

import { sql, testConnection } from "./connection";
import { readFileSync, readdirSync } from "fs";
import { resolve, dirname } from "path";

const MIGRATIONS_DIR = resolve(dirname(import.meta.path), "../../db/init");

async function main() {
  console.log("Database Migration Runner");
  console.log("=========================\n");

  // Test connection
  console.log("Connecting to database...");
  const connected = await testConnection();

  if (!connected) {
    console.error("❌ Failed to connect to database");
    console.error("Make sure PostgreSQL is running: docker compose up -d postgres");
    process.exit(1);
  }

  console.log("✓ Database connected\n");

  // Get migration files
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  console.log(`Found ${files.length} migration files\n`);

  // Apply migrations
  for (const file of files) {
    console.log(`Applying: ${file}...`);

    try {
      const migrationSql = readFileSync(resolve(MIGRATIONS_DIR, file), "utf-8");

      // Split by semicolons but handle function definitions
      const statements = splitSqlStatements(migrationSql);

      for (const statement of statements) {
        const trimmed = statement.trim();
        if (trimmed && !trimmed.startsWith("--")) {
          await sql.unsafe(trimmed);
        }
      }

      console.log(`  ✓ Applied`);
    } catch (error: any) {
      // Ignore "already exists" errors for idempotent migrations
      if (error.message?.includes("already exists")) {
        console.log(`  ⚠️  Already exists (skipping)`);
      } else {
        console.error(`  ❌ Failed:`, error.message);
      }
    }
  }

  console.log("\n✓ Migrations complete!");
  process.exit(0);
}

function splitSqlStatements(sql: string): string[] {
  const statements: string[] = [];
  let current = "";
  let inFunction = false;
  let dollarQuote = "";

  const lines = sql.split("\n");

  for (const line of lines) {
    // Track $$ function bodies
    if (line.includes("$$")) {
      const matches = line.match(/\$\w*\$/g) || [];
      for (const match of matches) {
        if (!inFunction) {
          inFunction = true;
          dollarQuote = match;
        } else if (match === dollarQuote) {
          inFunction = false;
          dollarQuote = "";
        }
      }
    }

    current += line + "\n";

    // Only split on ; if not inside a function body
    if (!inFunction && line.trim().endsWith(";")) {
      statements.push(current);
      current = "";
    }
  }

  if (current.trim()) {
    statements.push(current);
  }

  return statements;
}

main().catch((error) => {
  console.error("Migration failed:", error);
  process.exit(1);
});
