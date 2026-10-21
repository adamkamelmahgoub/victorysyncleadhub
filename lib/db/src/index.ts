import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

const databaseUrl = new URL(process.env.DATABASE_URL);
if (databaseUrl.hostname.endsWith(".pooler.supabase.com") && databaseUrl.port === "5432") databaseUrl.port = "6543";
export const pool = new Pool({ connectionString: databaseUrl.toString(), max: 1, idleTimeoutMillis: 10000, connectionTimeoutMillis: 8000 });
export const db = drizzle(pool, { schema });

export * from "./schema";
