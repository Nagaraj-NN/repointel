# RepoIntel — GitHub Repository Intelligence Platform

AI-powered internal web app for searchable, structured intelligence across all GitHub repositories in your organization.

## Tech Stack

- **Frontend + Backend:** SvelteKit (Vercel)
- **Database:** Neon Postgres + pgvector
- **Async Jobs:** QStash (Upstash)
- **AI:** OpenRouter (embeddings + LLM)
- **Integration:** GitHub REST API, Webhooks, GitHub App

## Setup

### 1. Install dependencies

```bash
cd repointel
npm install
```

### 2. Environment variables

Copy `.env.example` to `.env` and fill in:

```env
# GitHub App (create at https://github.com/settings/apps)
GITHUB_APP_ID=
GITHUB_APP_PRIVATE_KEY=
GITHUB_WEBHOOK_SECRET=
GITHUB_ORG=

# Neon Postgres (https://neon.tech)
DATABASE_URL=

# OpenRouter (https://openrouter.ai)
OPENROUTER_API_KEY=

# QStash (https://upstash.com/qstash)
QSTASH_TOKEN=
QSTASH_CURRENT_SIGNING_KEY=
QSTASH_NEXT_SIGNING_KEY=

# App URL (for webhook callbacks)
PUBLIC_BASE_URL=http://localhost:5173

# Worker auth (shared bearer token for internal worker endpoints)
WORKER_AUTH_SECRET=

# Reconcile endpoint auth (used for nightly/manual reconcile trigger)
RECONCILE_CRON_SECRET=

# Read API auth (optional — protects /api/repos, /api/chat, /api/audit in production)
# Generate with: [Convert]::ToBase64String((1..48 | ForEach-Object { Get-Random -Maximum 256 }))
API_AUTH_SECRET=
```

### 3. Database migration

```bash
npm run db:migrate
```

### 4. GitHub App setup

1. Create a GitHub App at https://github.com/settings/apps
2. Set webhook URL to `https://your-domain.com/api/webhooks/github`
3. Subscribe to: `push`, `repository`, `installation`, `installation_repositories`
4. Permissions: Repository metadata (read), Contents (read)
5. Install the app on your organization

### 5. Run locally

```bash
npm run dev
```

## Project structure

```
repointel/
├── lib/
│   ├── db/           # Database client, schema, migrations
│   ├── ai/           # Embeddings, chunking, LLM
│   ├── github.ts     # GitHub API helpers
│   ├── qstash.ts     # Job queue
│   └── intelligence.ts # Tech stack heuristics
├── src/routes/
│   ├── api/
│   │   ├── webhooks/github/   # GitHub webhook receiver
│   │   ├── workers/           # Sync, embed, summarize, reconcile
│   │   ├── repos/             # Repo list, detail, chat
│   │   ├── chat/              # Org-wide chat
│   │   └── audit/             # Audit dashboard
│   ├── repos/        # Repo catalog page
│   ├── repos/[id]/   # Repo detail + Ask-this-repo
│   ├── chat/         # Org chat
│   └── audit/        # Audit dashboard
└── lib/db/schema.sql
```

## API routes

| Route | Method | Auth | Description |
|-------|--------|------|-------------|
| `/api/webhooks/github` | POST | GitHub HMAC signature | GitHub webhook receiver |
| `/api/workers/sync-repo` | POST | Bearer `WORKER_AUTH_SECRET` | Sync repo metadata and files |
| `/api/workers/embed-repo` | POST | Bearer `WORKER_AUTH_SECRET` | Chunk + generate vector embeddings |
| `/api/workers/summarize-repo` | POST | Bearer `WORKER_AUTH_SECRET` | AI summaries + health score |
| `/api/workers/reconcile` | POST | Bearer `RECONCILE_CRON_SECRET` | Full or stale-only repo reconcile |
| `/api/sync-now` | POST | Same-origin or `API_AUTH_SECRET` | Manual sync trigger from UI |
| `/api/repos` | GET | Same-origin or `API_AUTH_SECRET` | List repos with SQL filters |
| `/api/repos/[id]` | GET | Same-origin or `API_AUTH_SECRET` | Repo detail + custom props + flags |
| `/api/repos/[id]/chat` | POST | Same-origin or `API_AUTH_SECRET` | Repo-scoped RAG Q&A |
| `/api/chat` | POST | Same-origin or `API_AUTH_SECRET` | Org-wide RAG Q&A |
| `/api/audit` | GET | Same-origin or `API_AUTH_SECRET` | Audit flags report |

### Sync modes

`POST /api/workers/reconcile` accepts an optional JSON body:

```json
{ "mode": "stale", "staleAfterHours": 24 }
```

- `mode: "stale"` (default) — only enqueues repos not synced in the last `staleAfterHours` hours.
- `mode: "all"` — enqueues every repo regardless of last sync time.

### Filters (`/api/repos`)

All filters are optional query parameters pushed into SQL (no in-memory scan):

| Param | Example | Description |
|-------|---------|-------------|
| `owner_team` | `platform` | Matches `owner_team` custom property |
| `lifecycle` | `active` | Matches `lifecycle` custom property |
| `domain` | `payments` | Partial match against `domain` custom property |
| `tech_stack` | `python` | Matches tech stack detected or language stats |

## Deployment (Vercel)

1. Connect repo to Vercel
2. Add all environment variables from `.env.example` in Vercel project settings
3. Ensure `PUBLIC_BASE_URL` is set to your Vercel production URL (no trailing slash)
4. Deploy

After first deploy:
- Run `npm run db:migrate` against your production `DATABASE_URL`
- Trigger an initial sync via the **Sync Now** button on the Repos page
- After embeddings are inserted, create the vector index for faster search:

```sql
CREATE INDEX IF NOT EXISTS idx_repo_embeddings_vector
ON repo_embeddings USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

ANALYZE repo_embeddings;
```

### Calling protected APIs externally

Set `API_AUTH_SECRET` in your environment and pass it as a bearer token:

```bash
curl -H "Authorization: Bearer <API_AUTH_SECRET>" https://your-domain.com/api/repos
```

Browser traffic from the same origin is always allowed without a token.

## License

MIT
