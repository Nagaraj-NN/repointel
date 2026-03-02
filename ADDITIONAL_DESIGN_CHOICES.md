# Additional Design Choices in `repointel/` (Beyond `Github Project.md`)

This document lists design choices implemented in `repointel/` that were not explicitly defined in `Github Project.md`, along with the reason each choice was made.

---

## 1) Fixed model selection via OpenRouter

- **Choice made:** Used `anthropic/claude-3-haiku` for chat/summaries and `openai/text-embedding-3-small` for embeddings.
- **Why this was chosen:** The architecture requested OpenRouter but did not lock specific models. Picking defaults made the app runnable immediately with a fast, lower-cost setup suitable for MVP.

---

## 2) Manual GitHub App JWT signing (no SDK wrapper)

- **Choice made:** Implemented GitHub App JWT generation directly using Node `crypto`.
- **Why this was chosen:** Reduced dependencies and enabled a transparent authentication flow that is easy to debug during initial build.

---

## 3) REST-first GitHub API approach

- **Choice made:** Implemented ingestion using GitHub REST endpoints only (repo data, languages, commits, README, docs, CODEOWNERS).
- **Why this was chosen:** The plan allowed REST + GraphQL. REST-only was faster to implement and simpler for MVP delivery.

---

## 4) Auto-bootstrap organizations from installation events

- **Choice made:** On `installation` and `installation_repositories` webhook events, automatically upsert entries in `organizations`.
- **Why this was chosen:** Eliminates manual org bootstrap and prepares the app for multi-org capability earlier.

---

## 5) CODEOWNERS retrieval simplification

- **Choice made:** Checked root `CODEOWNERS` path directly.
- **Why this was chosen:** Fastest path for MVP. Full GitHub fallback path search was deferred to reduce complexity.

---

## 6) Docs ingestion limited to markdown under `/docs`

- **Choice made:** Ingested only `.md` files from `/docs`.
- **Why this was chosen:** Keeps index quality high and avoids noisy/non-text docs in early versions.

---

## 7) Heuristic token estimation for chunking

- **Choice made:** Used `characters / 4` approximation for token count during chunking.
- **Why this was chosen:** Avoided adding tokenizer dependencies while still aligning chunk size with intended token budget.

---

## 8) Full re-embedding strategy per repo update

- **Choice made:** Delete existing embeddings for a repo, then regenerate all chunks/embeddings.
- **Why this was chosen:** Deterministic and simple MVP behavior. Incremental diff-based embedding updates were intentionally deferred.

---

## 9) Application-side filtering for `/api/repos`

- **Choice made:** Loaded repo records and applied combined filter logic in application code.
- **Why this was chosen:** Reduced dynamic SQL complexity and shipped predictable filter behavior quickly.

---

## 10) Explicit health scoring formula

- **Choice made:** Introduced weighted score logic using README, CODEOWNERS, architecture doc presence, and activity recency.
- **Why this was chosen:** The PRD asks for health indicators but not scoring math; this gives a practical, explainable initial scoring model.

---

## 11) Operational bootstrap scripts

- **Choice made:** Added `db:migrate` and `db:seed` scripts (`tsx` + `dotenv`).
- **Why this was chosen:** Speeds environment setup and improves reproducibility for local and deployment workflows.

---

## 12) Minimal internal UI theme and layout

- **Choice made:** Implemented a dark, lightweight internal-tool style UI with direct page navigation and simple cards.
- **Why this was chosen:** Optimized for speed of delivery and functional clarity over heavy design systems.

---

## Notes

- These choices were made to achieve a working MVP quickly while matching core architecture intent.
- Some of them are intentional shortcuts and should be revisited for production hardening (security, robustness, and scalability).

