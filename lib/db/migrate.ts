import 'dotenv/config';
import { neon } from '@neondatabase/serverless';
import { readFileSync } from 'fs';
import { join } from 'path';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL is required');
  process.exit(1);
}

const sql = neon(DATABASE_URL);
const schema = readFileSync(join(process.cwd(), 'lib/db/schema.sql'), 'utf-8');

async function migrate() {
  console.log('Running migrations...');

  const stripped = schema
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n');

  const statements = stripped
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  for (const statement of statements) {
    try {
      await sql(statement);
    } catch (err: any) {
      console.error('Statement failed:', statement.slice(0, 80));
      console.error(err.message);
      process.exit(1);
    }
  }

  console.log('Migrations completed successfully.');
}

migrate();
