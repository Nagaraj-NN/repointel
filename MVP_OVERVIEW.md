# RepoIntel MVP Overview

## Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                         GITHUB                                       │
│  Repository events (push, create, delete, install)                  │
└──────────────────────┬──────────────────────────────────────────────┘
                       │ Webhook (HMAC verified)
                       ▼
┌──────────────────────────────────────────────────────────────────────┐
│  /api/webhooks/github                                                │
│  - Verify signature                                                  │
│  - Handle: installation / installation_repositories / repository     │
│  - Enqueue → sync-repo job                                           │
└──────────────────────┬───────────────────────────────────────────────┘
                       │ QStash
                       ▼
┌──────────────────────────────────────────────────────────────────────┐
│  /api/workers/sync-repo                                              │
│  - Fetch repo metadata (language, commits, topics, custom props)     │
│  - Store in: repositories, repo_metadata, repo_custom_properties     │
│  - Fetch key files (README, CODEOWNERS, package.json...)             │
│  - Store in: repo_files, repo_docs                                   │
│  - Enqueue → embed-repo job                                          │
└──────────────────────┬───────────────────────────────────────────────┘
                       │ QStash
                       ▼
┌──────────────────────────────────────────────────────────────────────┐
│  /api/workers/embed-repo                                             │
│  - Chunk file contents                                               │
│  - Generate embeddings via OpenRouter (text-embedding-3-small)       │
│  - Store in: repo_embeddings (pgvector)                              │
│  - Enqueue → summarize-repo job                                      │
└──────────────────────┬───────────────────────────────────────────────┘
                       │ QStash
                       ▼
┌──────────────────────────────────────────────────────────────────────┐
│  /api/workers/summarize-repo                                         │
│  - Generate AI summary + arch summary via LLM (minimax-m2.5)        │
│  - Detect tech stack heuristically                                   │
│  - Calculate health score (README, CODEOWNERS, activity...)          │
│  - Store in: repo_summaries, repo_health_scores                      │
│  - Create audit_flags for quality issues                             │
└──────────────────────────────────────────────────────────────────────┘

                    SCHEDULED / MANUAL SYNC
┌─────────────────────────────────────────────────────────────────────┐
│  /api/workers/reconcile  (manual "Sync Now" or nightly cron)        │
│  - Fetch all repos from GitHub installation                          │
│  - Insert new repos, skip/enqueue stale ones (stale mode default)   │
│  - Feeds back into sync-repo → embed-repo → summarize-repo          │
└─────────────────────────────────────────────────────────────────────┘

                         UI LAYER
┌─────────────────────────────────────────────────────────────────────┐
│  /repos          → Repo catalog, filters, Sync Now, health scores   │
│  /repos/[id]     → Repo detail, custom props, audit flags, files    │
│  /chat           → Org-wide RAG chatbot (persistent history)        │
│  /repos/[id]/chat → Repo-scoped RAG chatbot                         │
│  /audit          → Health + flag dashboard                          │
└─────────────────────────────────────────────────────────────────────┘
```

---

## What the MVP Covers

| Area | Status |
|---|---|
| GitHub App webhook ingestion | Done |
| Repo metadata sync (language, topics, files) | Done |
| Vector embedding pipeline | Done |
| AI summary + health scoring | Done |
| RAG chat (org-wide + repo-scoped) | Done |
| Repo catalog with filters (domain, language, tech stack, lifecycle) | Done |
| Audit dashboard | Done |
| Manual sync (all or single repo, stale/full mode) | Done |
| Read API access hardening (same-origin + bearer token) | Done |
| Worker endpoint bearer auth | Done |

---

## What Is Yet To Be Built

Full details in [`PRODUCTION_TODO.md`](./PRODUCTION_TODO.md).

### P0 — Must-do before production

| # | Task |
|---|---|
| 1 | Replace bearer auth on workers with **QStash signature verification** |
| 2 | Add **GitHub OAuth / SSO login** — app is currently publicly accessible |
| 3 | Harden reconcile endpoint auth (exact secret comparison, audit logging) |
| 4 | Rotate all secrets used in testing, set final `PUBLIC_BASE_URL` |
| 5 | Run DB migration on production + create `ivfflat` vector index |

### P1 — Core completeness

| # | Task |
|---|---|
| 6 | Guaranteed GitHub custom properties ingestion + audit flags for missing props |
| 7 | **Nightly scheduled reconcile** (QStash schedule or Vercel Cron) |
| 8 | Retry with exponential backoff + dead-letter queue for failed jobs |
| 9 | Structured logs, metrics, and alerts (Slack/Email for worker failures) |

### P2 — Quality and cost controls

| # | Task |
|---|---|
| 10 | Test suite (unit + integration + API contract) + CI gates on PRs |
| 11 | Rate limiting on chat endpoints + request size limits |
| 12 | AI token usage tracking, budget alerts, fallback model strategy |

### P3 — Launch readiness

| # | Task |
|---|---|
| 13 | Runbooks for webhook failures, queue stalls, model outages, rollback |
| 14 | Final pre-launch checklist (load test, backup/restore, smoke test) |
