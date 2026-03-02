/**
 * Security Layer Integration Test
 * Usage: tsx scripts/test-security.ts
 *
 * Requires your dev server to be running: npm run dev
 * Reads BASE_URL and WORKER_AUTH_SECRET from .env
 */

import 'dotenv/config';

const BASE_URL = (process.env.PUBLIC_BASE_URL || 'http://localhost:5173').replace(/\/$/, '');
const WORKER_SECRET = process.env.WORKER_AUTH_SECRET || process.env.RECONCILE_CRON_SECRET || '';

const PASS = '\x1b[32m✓\x1b[0m';
const FAIL = '\x1b[31m✗\x1b[0m';
const INFO = '\x1b[34m→\x1b[0m';
const WARN = '\x1b[33m⚠\x1b[0m';

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string, detail?: string) {
  if (condition) {
    console.log(`  ${PASS} ${label}`);
    passed++;
  } else {
    console.log(`  ${FAIL} ${label}${detail ? ` — ${detail}` : ''}`);
    failed++;
  }
}

async function getJson(url: string): Promise<{ status: number; body: unknown }> {
  const res = await fetch(url);
  let body: unknown;
  try { body = await res.json(); } catch { body = null; }
  return { status: res.status, body };
}

async function postJson(url: string, payload: unknown, bearer?: string) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (bearer) headers['Authorization'] = `Bearer ${bearer}`;
  const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(payload) });
  let body: unknown;
  try { body = await res.json(); } catch { body = null; }
  return { status: res.status, body };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function pickTestRepo(): Promise<{ id: string; full_name: string } | null> {
  const { status, body } = await getJson(`${BASE_URL}/api/repos?limit=1`);
  if (status !== 200) return null;
  const repos = (body as { repos?: { id: string; full_name: string }[] })?.repos;
  return repos?.[0] ?? null;
}

// ── Test Suites ───────────────────────────────────────────────────────────────

async function testOrgSecurityEndpoint() {
  console.log('\n\x1b[1m[1] GET /api/security — org-wide dashboard\x1b[0m');

  const { status, body } = await getJson(`${BASE_URL}/api/security`);
  const data = body as Record<string, unknown>;

  assert(status === 200, `HTTP 200`, `got ${status}`);
  assert(typeof data?.totals === 'object', 'Response has totals object');

  const totals = data?.totals as Record<string, unknown> | undefined;
  assert(typeof totals?.critical === 'number', 'totals.critical is a number');
  assert(typeof totals?.high === 'number', 'totals.high is a number');
  assert(typeof totals?.medium === 'number', 'totals.medium is a number');
  assert(typeof totals?.low === 'number', 'totals.low is a number');
  assert(typeof totals?.secrets === 'number', 'totals.secrets is a number');
  assert(typeof totals?.repos_scanned === 'number', 'totals.repos_scanned is a number');
  assert(typeof data?.repos_with_critical === 'number', 'repos_with_critical is a number');
  assert(typeof data?.repos_with_secrets === 'number', 'repos_with_secrets is a number');
  assert(Array.isArray(data?.at_risk_repos), 'at_risk_repos is an array');

  console.log(`  ${INFO} repos_scanned=${totals?.repos_scanned}  critical=${totals?.critical}  high=${totals?.high}  secrets=${totals?.secrets}`);
}

async function testRepoSecurityEndpoint(repoId: string, fullName: string) {
  console.log(`\n\x1b[1m[2] GET /api/repos/${repoId}/security — ${fullName}\x1b[0m`);

  const { status, body } = await getJson(`${BASE_URL}/api/repos/${repoId}/security`);
  const data = body as Record<string, unknown>;

  assert(status === 200, `HTTP 200`, `got ${status}`);
  assert(data?.repo_id === repoId, 'repo_id matches');
  assert(Array.isArray(data?.vulnerabilities), 'vulnerabilities is an array');
  assert(Array.isArray(data?.secrets), 'secrets is an array');
  assert(
    data?.security_score === null || typeof data?.security_score === 'number',
    'security_score is number or null'
  );

  const score = data?.security_score as number | null;
  const vulnCount = (data?.vulnerabilities as unknown[])?.length ?? 0;
  const secretCount = (data?.secrets as unknown[])?.length ?? 0;

  if (score !== null) {
    assert(score >= 0 && score <= 100, `security_score in range 0–100`, `got ${score}`);
    console.log(`  ${INFO} score=${score}  vulns=${vulnCount}  secrets=${secretCount}  last_scanned=${data?.last_scanned_at ?? 'never'}`);
  } else {
    console.log(`  ${WARN} Repo not yet scanned — score is null (expected before first sync)`);
  }

  // Validate vulnerability shape if any exist
  const vulns = (data?.vulnerabilities ?? []) as Record<string, unknown>[];
  if (vulns.length > 0) {
    const v = vulns[0];
    assert(typeof v.alert_number === 'number', 'vuln.alert_number is a number');
    assert(typeof v.severity === 'string', 'vuln.severity is a string');
    assert(['critical', 'high', 'medium', 'low', 'unknown'].includes(v.severity as string), `vuln.severity is valid`, `got "${v.severity}"`);
    assert(typeof v.state === 'string', 'vuln.state is a string');
    console.log(`  ${INFO} Sample vuln: ${v.package_name ?? v.cve_id} — ${v.severity} (${v.state})`);
  }
}

async function testRepoSecurityEndpointNotFound() {
  console.log('\n\x1b[1m[3] GET /api/repos/nonexistent-id/security — 404 handling\x1b[0m');
  const { status, body } = await getJson(`${BASE_URL}/api/repos/00000000-0000-0000-0000-000000000000/security`);
  assert(status === 404, `HTTP 404 for unknown repo`, `got ${status}`);
  assert(typeof (body as Record<string, unknown>)?.error === 'string', 'Error message returned');
}

async function testScanWorkerAuth() {
  console.log('\n\x1b[1m[4] POST /api/workers/scan-repo — auth checks\x1b[0m');

  // No auth
  const { status: s1 } = await postJson(`${BASE_URL}/api/workers/scan-repo`, {});
  assert(s1 === 401, 'Returns 401 with no Authorization header', `got ${s1}`);

  // Wrong token
  const { status: s2 } = await postJson(`${BASE_URL}/api/workers/scan-repo`, {}, 'wrong-token');
  assert(s2 === 401, 'Returns 401 with wrong token', `got ${s2}`);

  // Missing body fields
  const { status: s3, body: b3 } = await postJson(`${BASE_URL}/api/workers/scan-repo`, {}, WORKER_SECRET);
  assert(s3 === 400, 'Returns 400 when repoId/fullName missing', `got ${s3}`);
  assert(typeof (b3 as Record<string, unknown>)?.error === 'string', 'Error message returned');
}

async function testScanWorkerWithRealRepo(repoId: string, fullName: string) {
  console.log(`\n\x1b[1m[5] POST /api/workers/scan-repo — live scan of ${fullName}\x1b[0m`);

  if (!WORKER_SECRET) {
    console.log(`  ${WARN} WORKER_AUTH_SECRET not set — skipping live scan test`);
    return;
  }

  console.log(`  ${INFO} Triggering scan (may take a few seconds)...`);
  const { status, body } = await postJson(
    `${BASE_URL}/api/workers/scan-repo`,
    { repoId, fullName },
    WORKER_SECRET
  );
  const data = body as Record<string, unknown>;

  assert(status === 200 || status === 500, `Worker responded (200 ok, 500 = GitHub API error)`, `got ${status}`);

  if (status === 200) {
    assert(data?.ok === true, 'Response ok=true');
    assert(typeof data?.score === 'number', 'Score returned', `got ${typeof data?.score}`);
    const score = data?.score as number;
    assert(score >= 0 && score <= 100, `Score in range 0–100`, `got ${score}`);
    const counts = data?.counts as Record<string, number> | undefined;
    console.log(`  ${INFO} score=${score}  critical=${counts?.critical ?? 0}  high=${counts?.high ?? 0}  secrets=${counts?.secrets ?? 0}`);

    // Re-fetch security endpoint to confirm data was persisted
    console.log(`  ${INFO} Verifying data persisted to DB...`);
    const { status: s2, body: b2 } = await getJson(`${BASE_URL}/api/repos/${repoId}/security`);
    const persisted = b2 as Record<string, unknown>;
    assert(s2 === 200, 'Security endpoint returns 200 after scan');
    assert(persisted?.last_scanned_at !== null, 'last_scanned_at is set after scan');
    assert(persisted?.security_score === score, 'Persisted score matches worker response', `expected ${score}, got ${persisted?.security_score}`);
  } else {
    // GitHub API might 403/404 if permissions not configured yet
    const msg = (data as Record<string, unknown>)?.error as string ?? '';
    console.log(`  ${WARN} Scan returned ${status}: ${msg}`);
    console.log(`  ${WARN} This is expected if GitHub App permissions are not yet updated`);
  }
}

async function testScoreCalculation() {
  console.log('\n\x1b[1m[6] Security score calculation — unit checks\x1b[0m');

  // Import and test the pure function directly
  const { calculateSecurityScore } = await import('../lib/intelligence.js');

  const perfect = calculateSecurityScore({ critical: 0, high: 0, medium: 0, low: 0, secrets: 0 });
  assert(perfect === 100, `Clean repo scores 100`, `got ${perfect}`);

  const oneCritical = calculateSecurityScore({ critical: 1, high: 0, medium: 0, low: 0, secrets: 0 });
  assert(oneCritical === 75, `1 critical = score 75`, `got ${oneCritical}`);

  const twoCritical = calculateSecurityScore({ critical: 2, high: 0, medium: 0, low: 0, secrets: 0 });
  assert(twoCritical === 50, `2 critical = score 50`, `got ${twoCritical}`);

  const manyCritical = calculateSecurityScore({ critical: 10, high: 0, medium: 0, low: 0, secrets: 0 });
  assert(manyCritical === 50, `Critical capped at -50 (score 50)`, `got ${manyCritical}`);

  const withSecrets = calculateSecurityScore({ critical: 0, high: 0, medium: 0, low: 0, secrets: 1 });
  assert(withSecrets === 85, `1 secret = score 85`, `got ${withSecrets}`);

  const worst = calculateSecurityScore({ critical: 10, high: 10, medium: 10, low: 10, secrets: 10 });
  assert(worst === 0, `Worst case score is 0 (not negative)`, `got ${worst}`);

  const mixed = calculateSecurityScore({ critical: 1, high: 1, medium: 1, low: 0, secrets: 1 });
  // 100 - 25 - 10 - 5 - 15 = 45
  assert(mixed === 45, `Mixed: 1 critical + 1 high + 1 medium + 1 secret = 45`, `got ${mixed}`);
}

// ── Runner ────────────────────────────────────────────────────────────────────

async function run() {
  console.log('\x1b[1m\x1b[34mRepoIntel — Security Layer Test\x1b[0m');
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`Worker secret: ${WORKER_SECRET ? '*** (set)' : '\x1b[31m(not set)\x1b[0m'}`);

  // Score calculation runs entirely locally — no server needed
  await testScoreCalculation();

  // Check if dev server is reachable
  try {
    await fetch(`${BASE_URL}/api/repos`);
  } catch {
    console.log(`\n\x1b[31mCannot reach ${BASE_URL} — is the dev server running?\x1b[0m`);
    console.log('Run: npm run dev\n');
    process.exit(1);
  }

  await testOrgSecurityEndpoint();
  await testRepoSecurityEndpointNotFound();
  await testScanWorkerAuth();

  const repo = await pickTestRepo();
  if (repo) {
    await testRepoSecurityEndpoint(repo.id, repo.full_name);
    await testScanWorkerWithRealRepo(repo.id, repo.full_name);
  } else {
    console.log(`\n${WARN} No repos found in DB — skipping per-repo and live scan tests`);
    console.log(`   Run a reconcile first: POST /api/workers/reconcile`);
  }

  // Summary
  const total = passed + failed;
  console.log(`\n${'─'.repeat(50)}`);
  if (failed === 0) {
    console.log(`\x1b[32m\x1b[1m All ${total} tests passed\x1b[0m`);
  } else {
    console.log(`\x1b[32m${passed} passed\x1b[0m  \x1b[31m${failed} failed\x1b[0m  (${total} total)`);
  }
  console.log('');

  process.exit(failed > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error('\x1b[31mUnhandled error:\x1b[0m', err);
  process.exit(1);
});
