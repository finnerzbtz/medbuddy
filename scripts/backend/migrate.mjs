import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
const environment = process.argv[2] ?? 'development';
if (!['development', 'production'].includes(environment))
  throw new Error('Choose development or production.');
const path = `.env.backend.${environment}.local`;
const env = await readFile(path, 'utf8');
const url = env
  .split('\n')
  .find((line) => line.startsWith('DATABASE_URL='))
  ?.slice(13)
  .trim();
if (!url || new URL(url).hostname.includes('-pooler'))
  throw new Error('A direct migration connection is required.');
const pool = new pg.Pool({ connectionString: url, max: 1 });
try {
  await migrate(drizzle(pool), { migrationsFolder: 'database/migrations' });
  console.log(`Applied checked-in migrations to ${environment}.`);
} finally {
  await pool.end();
}
