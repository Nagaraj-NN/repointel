import { neon } from '@neondatabase/serverless';
import { DATABASE_URL } from '$env/static/private';

export function getDb() {
  const url = DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  return neon(url);
}
