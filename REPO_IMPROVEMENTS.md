# RepoIntel Improvement Plan

## Current Status

- Build and type checks are green (`npm run check`, `npm run build`).
- Sync pipeline supports all-repo and single-repo sync from the Repos page.
- Org Chat supports persistent multi-message history in browser storage.

## Priority Improvements

1. **API security hardening**
   - Read/query endpoints are optionally protected with `API_AUTH_SECRET`.
   - For production, enforce auth by default and add user/session-based access control.

2. **Sync cost controls**
   - Reconcile currently enqueues sync for all repos each run.
   - Add incremental/stale-only reconcile mode to reduce GitHub and AI cost.

3. **Observability**
   - Persist worker execution states in `ingestion_jobs`.
   - Add UI status for queued/running/success/failed per repo.

4. **Performance**
   - Repo property filtering currently includes in-memory logic.
   - Move more filtering into SQL for better scaling on large orgs.

5. **Testing coverage**
   - Add API integration tests for reconcile/sync/filter/chat flows.
   - Add regression tests for domain/language filtering and sync selection.

6. **Tenant scoping**
   - Org-wide chat and repo listing endpoints do not filter by `org_id`; add org/session scoping to avoid cross-org data leakage.
   - Ensure worker and embedding queries always include org context so multi-org deployments stay isolated.

7. **Abuse and cost guards**
   - Add per-IP/session rate limiting and max message length on `/api/chat` and repo chat to prevent runaway OpenRouter spend.
   - Add timeouts and structured error responses around embeddings/LLM calls so clients can retry gracefully.

8. **Vector query performance**
   - Create the `ivfflat` index on `repo_embeddings.embedding` in a guarded migration (skip if table empty) to avoid full scans.
   - When org or repo is known, filter by `repo_id` before ANN search to shrink the candidate set.

## Recommended Milestones

- **Milestone 1:** Enforce auth + add sync observability.
- **Milestone 2:** Implement incremental reconcile strategy.
- **Milestone 3:** Add test suite for core API and worker paths.
