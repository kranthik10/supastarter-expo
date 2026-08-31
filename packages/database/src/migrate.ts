import { sql } from 'drizzle-orm';
import { getDb } from './index';

async function migrate() {
  const db = getDb();
  console.log('Running migrations via drizzle-kit push is preferred for dev. This placeholder connects to DB.');
  const result = await db.execute(sql`select 1 as ok`);
  console.log('DB ok:', result.rows?.[0] ?? result);
}

migrate()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
