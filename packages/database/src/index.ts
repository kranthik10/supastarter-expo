import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

export function createDb(connectionString: string) {
  const pool = new Pool({ connectionString });
  return drizzle(pool, { schema });
}

export type Database = ReturnType<typeof createDb>;
export * from './schema';

let _db: Database | null = null;

export function getDb(url?: string): Database {
  const conn = url ?? process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/mobile_saas_dev';
  if (!_db) _db = createDb(conn);
  return _db;
}

export { schema };
