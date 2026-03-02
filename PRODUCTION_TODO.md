# RepoIntel Production TODO Guide

This document is a practical runbook to move RepoIntel from current state to production.

## How to use this guide

- Work in order from **P0** to **P3**.
- Do not skip **P0**. Those items are required for safe production launch.
- For each task, complete the **Verification** step before moving on.

---

## P0 - Must-Do Before Production

## 1) Protect all worker endpoints with QStash signature verification

**Why:** Today worker endpoints can be called by any public client if URL is known.

**Applies to:**
- `/api/workers/sync-repo`
- `/api/workers/embed-repo`
- `/api/workers/summarize-repo`
- `/api/workers/reconcile`

### Steps

1. In each worker route, read raw request body and the `Upstash-Signature` header.
2. Use `Receiver` from `@upstash/qstash` to verify signature with:
   - `QSTASH_CURRENT_SIGNING_KEY`
   - `QSTASH_NEXT_SIGNING_KEY`
3. Reject request with `401` if signature is invalid.
4. Parse body only after successful verification.

### Suggested implementation sketch

```ts
import { Receiver } from '@upstash/qstash';

const receiver = new Receiver({
  currentSigningKey: process.env.QSTASH_CURRENT_SIGNING_KEY!,
  nextSigningKey: process.env.QSTASH_NEXT_SIGNING_KEY!
});

const rawBody = await request.text();
const signature = request.headers.get('upstash-signature') ?? '';

const ok = await receiver.verify({
  signature,
  body: rawBody,
  url: `${process.env.PUBLIC_BASE_URL}/api/workers/sync-repo`
});

if (!ok) return json({ error: 'Unauthorized' }, { status: 401 });
const payload = JSON.parse(rawBody);
```

### Verification

- Call endpoint without signature -> must return `401`.
- Trigger job from QStash -> must process successfully.

---

## 2) Add application authentication (org-only access)

**Why:** Current UI/API is publicly accessible.

### Recommendation

Use **GitHub OAuth** with org membership check (or your company SSO provider).

### Steps

1. Add auth provider (e.g., `auth.js` / `lucia` / enterprise SSO gateway).
2. Require login for all app pages and API routes except webhook/worker routes.
3. During login, validate user belongs to allowed org/team.
4. Store minimal session data (user id, login, roles).
5. Add logout flow and session expiry.

### Verification

- Logged-out user cannot access `/repos`, `/chat`, `/audit`.
- Logged-in non-org user is blocked.
- Logged-in org user can access app.

---

## 3) Secure reconcile endpoint auth

**Why:** `/api/workers/reconcile` currently accepts any bearer token format, not a validated token.

### Steps

1. Either:
   - Make reconcile callable only through QStash and verify signature (preferred), or
   - Validate against `RECONCILE_CRON_SECRET` exactly.
2. Remove permissive `startsWith('Bearer ')` logic.
3. Add audit logs (who/what triggered reconcile).

### Verification

- Invalid or missing token/signature -> `401`.
- Scheduled reconcile runs successfully.

---

## 4) Configure production infrastructure and secrets

### Required services

- Vercel project (web app + API)
- Neon Postgres (with `pgvector`)
- Upstash QStash
- OpenRouter
- GitHub App (org-installed)

### Required environment variables

- `GITHUB_APP_ID`
- `GITHUB_APP_PRIVATE_KEY`
- `GITHUB_WEBHOOK_SECRET`
- `GITHUB_ORG`
- `DATABASE_URL`
- `OPENROUTER_API_KEY`
- `QSTASH_TOKEN`
- `QSTASH_CURRENT_SIGNING_KEY`
- `QSTASH_NEXT_SIGNING_KEY`
- `PUBLIC_BASE_URL`
- `RECONCILE_CRON_SECRET` (if using token approach)

### Steps

1. Set env vars in Vercel Production + Preview + Development scopes.
2. Rotate keys if any were used in testing logs/screenshots.
3. Ensure `PUBLIC_BASE_URL` points to final production domain.
4. Verify GitHub webhook points to production URL.

### Verification

- Deploy succeeds with no missing env var errors.
- Webhook delivery in GitHub shows `200` responses.

---

## 5) Run DB migration and enable vector index

**Why:** You need schema and performant vector search in production.

### Steps

1. Run migration against production DB.
2. After first embeddings are inserted, create `ivfflat` index manually:

```sql
CREATE INDEX IF NOT EXISTS idx_repo_embeddings_vector
ON repo_embeddings USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);
```

3. Analyze table statistics:

```sql
ANALYZE repo_embeddings;
```

### Verification

- All tables exist.
- Vector query latency is acceptable under load tests.

---

## P1 - Core Completeness for Real Usage

## 6) Implement GitHub custom properties ingestion

**Why:** Filters rely on `owner_team`, `lifecycle`, `domain`; currently these are not guaranteed to be populated.

### Steps

1. In sync worker, call GitHub custom properties API for each repo.
2. Upsert values into `repo_custom_properties`.
3. Enforce required property set; if missing, create audit flags.

### Verification

- Filters in `/repos` return expected repos by owner/lifecycle/domain.
- Repos with missing properties are visible in audit flags.

---

## 7) Add scheduled reconcile job (nightly)

**Why:** Webhooks can miss events; nightly reconcile keeps source of truth aligned.

### Steps

1. Create QStash schedule or Vercel Cron (once per day).
2. Trigger `/api/workers/reconcile`.
3. Log summary: repos scanned, new repos, failed repos.

### Verification

- Job appears in scheduler run history daily.
- Reconcile summary logs are visible.

---

## 8) Add robust retry and dead-letter handling

**Why:** External APIs (GitHub/OpenRouter) fail intermittently.

### Steps

1. Add retry with exponential backoff for:
   - GitHub API calls
   - OpenRouter calls
2. Track retry count in `ingestion_jobs`.
3. Add dead-letter status when max retries exceeded.
4. Build admin view or query for failed jobs.

### Verification

- Temporary failures recover automatically.
- Permanent failures are visible and actionable.

---

## 9) Improve observability (logs, metrics, alerts)

### Steps

1. Add structured logs (JSON) with request/job IDs.
2. Add metrics:
   - Webhook success rate
   - Sync duration
   - Embed duration
   - Summarize duration
   - Chat response time
   - Error rate
3. Configure alerts (Slack/Email) for:
   - Worker failures
   - Reconcile failures
   - High latency

### Verification

- You can trace one webhook through sync -> embed -> summarize.
- Alerts fire on simulated failure.

---

## P2 - Quality, Reliability, and Cost Controls

## 10) Add test suite and CI gates

### Minimum tests

- Unit tests:
  - chunking behavior
  - health score calculation
  - tech stack detection
- Integration tests:
  - webhook verification
  - worker happy path
  - chat endpoint with mocked LLM
- API contract tests for key routes

### CI checks

- Typecheck
- Tests
- Lint
- Build

### Verification

- PR cannot merge unless checks pass.

---

## 11) Add rate limiting and abuse controls

### Steps

1. Add per-user/per-IP rate limits for chat endpoints.
2. Add request size limits.
3. Add timeout + cancellation for long AI calls.

### Verification

- Excessive calls return `429`.
- System remains responsive under burst traffic.

---

## 12) Add AI cost and quality controls

### Steps

1. Log token usage per endpoint.
2. Add monthly budget threshold alerts.
3. Add fallback model strategy if primary model fails.
4. Tighten prompts to enforce citation format.

### Verification

- Cost dashboard shows daily/weekly trends.
- If model fails, fallback returns a graceful response.

---

## P3 - Launch Readiness and Operations

## 13) Prepare runbooks and on-call playbooks

Create docs for:
- Webhook failures
- Stuck ingestion queue
- OpenRouter outage
- Neon outage
- Bad deployment rollback

### Verification

- Team can execute recovery steps without code author present.

---

## 14) Final pre-launch checklist

- [ ] All P0 tasks complete
- [ ] All P1 tasks complete
- [ ] Security review complete
- [ ] Load test complete
- [ ] Backup/restore tested
- [ ] Monitoring/alerts active
- [ ] CI/CD protections active
- [ ] Production smoke test passed

---

## Production smoke test (execute after deployment)

1. Trigger a test repo change in GitHub.
2. Confirm webhook received (`200`).
3. Confirm sync worker updates repo metadata.
4. Confirm embeddings created.
5. Confirm summaries generated.
6. Open repo page and verify displayed data.
7. Ask repo chat question and verify citations.
8. Ask org chat question and verify cross-repo citations.
9. Open audit page and verify flags appear.

If all pass, production rollout is ready.

