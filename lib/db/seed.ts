/**
 * Seed script: Create an organization and optionally trigger initial sync.
 * Run: DATABASE_URL=... npx tsx lib/db/seed.ts
 *
 * You need to manually add your org's GitHub ID and installation ID
 * from the GitHub App installation page.
 */
import 'dotenv/config';
import { neon } from '@neondatabase/serverless';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL required');
  process.exit(1);
}

const sql = neon(DATABASE_URL);

async function seed() {
  const githubId = process.env.GITHUB_ORG_ID || process.argv[2];
  const installId = process.env.GITHUB_INSTALL_ID || process.argv[3];
  const orgName = process.env.GITHUB_ORG || process.argv[4];

  if (!githubId || !installId || !orgName) {
    console.log('Usage: GITHUB_ORG_ID=123 GITHUB_INSTALL_ID=456 GITHUB_ORG=myorg npx tsx lib/db/seed.ts');
    console.log('Or: npx tsx lib/db/seed.ts <github_org_id> <install_id> <org_name>');
    process.exit(1);
  }

  await sql`
    INSERT INTO organizations (github_id, name, install_id)
    VALUES (${Number(githubId)}, ${orgName}, ${Number(installId)})
    ON CONFLICT (github_id) DO UPDATE SET install_id = EXCLUDED.install_id, updated_at = NOW()
  `;
  console.log('Organization seeded:', orgName);
}

seed().catch(console.error);
