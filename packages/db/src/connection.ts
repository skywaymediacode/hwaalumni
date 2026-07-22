import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as tables from "./schema";

export type Database = NodePgDatabase<typeof tables>;

export interface DatabaseHandle {
  db: Database;
  pool: Pool;
}

export function createDatabase(databaseUrl: string): DatabaseHandle {
  const pool = new Pool({
    connectionString: databaseUrl,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000
  });
  return { db: drizzle(pool, { schema: tables }), pool };
}
