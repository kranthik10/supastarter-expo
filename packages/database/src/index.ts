import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

export function createDb(connectionString: string) {
  const pool = new Pool({ connectionString });
  return drizzle(pool, { schema });
}

export type Database = ReturnType<typeof createDb>;
export * from './schema';

export function getDatabaseUrl(env: Record<string, string | undefined> = process.env): string {
  const url = env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required');
  return url;
}

let _db: Database | null = null;

export function getDb(url?: string): Database {
  const conn = url ?? getDatabaseUrl();
  if (!_db) _db = createDb(conn);
  return _db;
}

export { schema };
