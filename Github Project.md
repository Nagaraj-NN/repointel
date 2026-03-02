# RepoIntel — GitHub Repository Intelligence Platform

---

## Implementation Phases

### Phase 0 — Architecture & Guardrails

**Goal:** Lock scope and non-negotiables.

**Define:**

- GitHub is the source of truth
- App is a read-only intelligence layer
- AI must always cite GitHub URLs
- No manual editing of repo summaries in DB
- Custom Properties are required for all repos

**Design decisions:**

- Ingestion model: Webhook + periodic reconciliation
- RAG model: Hybrid search (PGVector + keyword)
- Token budget rules
- Indexing granularity (file-level, not whole repo blob)

**Deliverables:**

- System architecture diagram
- Data model draft
- Ingestion spec
- AI prompt strategy doc

> This prevents chaos later.

---

### Phase 1 — GitHub Integration Layer

*(Sequential First, then Parallel)*

**Stack:** GitHub API + QStash + SvelteKit API routes

**Build:**

- GitHub App (org-installed)
- Webhook ingestion endpoint
- Repo sync worker
- Scheduled reconciliation job

**Data pulled:**

- Repos
- Default branch
- README
- `/docs` directory
- CODEOWNERS
- Custom properties
- Language stats
- Last commit metadata

Store raw content in Postgres.

> Parallelizable once base webhook works.

---

### Phase 2 — Data Model & Storage Foundation (Parallel)

**Stack:** Neon Postgres + pgvector

**Core tables:**

- `organizations`
- `repositories`
- `repo_metadata`
- `repo_custom_properties`
- `repo_files`
- `repo_docs`
- `repo_embeddings`
- `repo_summaries`
- `ingestion_jobs`
- `sync_logs`

**Index:**

- File-level embeddings
- README + architecture docs separately
- Optional: issue/discussion embeddings later

**Design for:**

- Incremental updates
- Deleting stale embeddings
- Multi-org capability

---

### Phase 3 — Embedding & RAG Pipeline (Parallel)

**Stack:** OpenRouter + PGVector

**Build:**

- Chunking strategy (1000–1500 tokens, overlap 150)
- Embedding pipeline
- Hybrid search (vector + ILIKE fallback)
- Context assembler
- Citation generator (line-level GitHub permalinks)

**AI behaviors:**

- Repo overview generation
- Architecture summary generation
- "Where is X implemented?" Q&A
- "How do I run this?" extraction

**All responses must:**

- Include GitHub links
- Include file paths
- Show confidence level

---

### Phase 4 — Repo Intelligence Engine (Parallel)

> This is the system's differentiator.

**Features:**

- **Auto-generated:**
  - Problem summary
  - Tech stack detection
  - Entry points
  - Architectural style classification
  - Dependency highlights

- **Risk detection:**
  - No README
  - No CODEOWNERS
  - Deprecated repo
  - Inactive > X months

**Tech stack inference logic:**

- `package.json`
- `requirements.txt`
- `pom.xml`
- `Dockerfile`
- etc.

**This layer uses:**

- Heuristics first
- AI second

---

### Phase 5 — Internal Web App (SvelteKit UI) (Parallel)

**UI modules:**

#### 1) Repo Catalog

- **Filters by:**
  - `owner_team`
  - `lifecycle`
  - `tech stack`
  - `domain`
- Health indicators

#### 2) Repo Detail Page

- Human-authored summary
- AI summary
- Architecture section
- Tech stack card
- Key files
- Code reference links
- Ask-this-repo chat panel

#### 3) Org Chat

- "Where do we handle payments?"
- "Which services use Redis?"
- "What repos are inactive?"

#### 4) Audit Mode

- Identify stale repos
- Identify missing documentation
- Identify duplication

---

### Phase 6 — Automation & Governance Layer (Parallel)

- **PR check:**
  - Enforce README sections
  - Enforce `docs/architecture.md`
  - Enforce custom properties

- **Scheduled nightly:**
  - Reconcile repo list
  - Detect deleted repos

- **Slack notifications:**
  - Missing documentation
  - Repo stale warnings
  - Failed ingestion

> This is how you prevent entropy.

---

### Phase 7 — Intelligence Scaling & Optimization (Later)

**Add:**

- Cross-repo dependency graph
- Service-to-service inference
- Repo similarity detection
- Duplicate solution detection
- "Before building X, check these repos" suggestion engine
- Org-wide architecture map

> This should not block MVP.

---

### Phase 8 — Security & Vulnerability Intelligence (Proposed Addition)

**Goal:** Provide visibility into security posture across all repositories.

**Stack:** GitHub Advanced Security APIs + Dependabot + Third-party scanners (Snyk/Trivy) + RepoIntel AI layer

#### 8.1 Vulnerability Scanning Integration

**Data pulled from GitHub:**

- Dependabot alerts (vulnerable dependencies)
- Code scanning alerts (if configured)
- Secret scanning alerts (exposed credentials)

**Additional scanning (optional):**

- Container image vulnerabilities (Trivy/Grype)
- License compliance (FOSSA/Licensee)
- Infrastructure-as-code misconfigurations (Checkov/tfsec)

#### 8.2 Security Risk Detection

Extend existing risk detection to include:

- **Critical:** Known CVEs in dependencies (CVSS 9.0+)
- **High:** Exposed secrets (API keys, passwords, tokens)
- **Medium:** Outdated dependencies (> 6 months behind)
- **Low:** Missing security scan configuration
- **Compliance:** Non-approved licenses (GPL in proprietary code)

#### 8.3 Security Dashboard (UI)

**Org-wide Security View:**

| Metric | Description |
|--------|-------------|
| Total open vulnerabilities | Grouped by severity (Critical/High/Medium/Low) |
| Repos with exposed secrets | Count + list |
| Repos without security scans | Repos missing Dependabot/CodeQL setup |
| Mean time to remediate | Average days to fix vulnerabilities |
| License risk summary | Repos with copyleft/unknown licenses |

**Repo-level Security Card:**

- Vulnerability count by severity
- Last security scan date
- Secret scanning status (enabled/disabled)
- Dependency freshness score
- License compliance status

#### 8.4 Security-Focused AI Q&A

Enable questions like:

- "Which repos have critical vulnerabilities?"
- "Show me all repos using Log4j"
- "What repos have outdated dependencies?"
- "What repos have exposed secrets?"
- "Which production repos haven't been scanned in 30 days?"
- "List all repos with GPL dependencies"
- "What's our overall security posture?"

#### 8.5 Automated Security Governance

**PR checks (extend Phase 6):**

- Block merge if critical vulnerabilities introduced
- Block merge if secrets detected
- Warn on high-risk license additions

**Scheduled security jobs:**

- Daily vulnerability sync from GitHub/Dependabot
- Weekly security posture report to Slack/email
- Alert on new critical CVEs affecting org repos

**Slack notifications (extend Phase 6):**

- New critical vulnerability detected
- Secret exposure detected
- Security scan disabled on repo
- Vulnerability SLA breach (> X days unfixed)

#### 8.6 Security Data Model (Additions)

New tables:

- `repo_vulnerabilities` (CVE ID, severity, package, status, detected_at, resolved_at)
- `repo_secrets_alerts` (type, location, status, detected_at)
- `repo_license_findings` (license_type, package, risk_level)
- `repo_security_scores` (vulnerability_score, secret_score, freshness_score, overall)
- `security_scan_jobs` (repo_id, scan_type, last_run, status)

#### 8.7 Security Metrics for Success

- Mean time to detect (MTTD) vulnerabilities
- Mean time to remediate (MTTR) vulnerabilities
- % of repos with security scanning enabled
- Reduction in critical/high vulnerabilities over time
- Secret exposure incidents prevented
- License compliance rate

#### 8.8 Phased Security Delivery

| Phase | Security Features |
|-------|-------------------|
| **Security MVP** | Dependabot alert sync, Security card on repo page, Basic vulnerability dashboard |
| **Security V2** | Secret scanning, AI security Q&A, Slack alerts |
| **Security V3** | License compliance, Container scanning, PR security gates, Executive reporting |

---

### Business Impact of Security Features

| Problem Today | With Security Intelligence | Impact |
|---------------|---------------------------|--------|
| Vulnerabilities go unnoticed | Centralized visibility across all repos | **Reduced breach risk** |
| No one knows which repos are insecure | Security scores on every repo | **Informed prioritization** |
| Secrets get exposed in code | Automatic detection + alerts | **Prevented credential theft** |
| License risks untracked | Compliance dashboard | **Avoided legal issues** |
| Security team manually audits | Self-service security search | **Security team scales** |
| Slow vulnerability response | SLA tracking + alerts | **Faster remediation** |

---

### Example Security Scenarios

**Scenario A: Zero-Day Response**

> A critical Log4j vulnerability is announced. Leadership asks: "Are we affected?"

**Without Security Intelligence:** Engineers manually check 300 repos. Takes 2 days.

**With Security Intelligence:** Search "repos using Log4j" → Instant list of 12 affected repos with owners and severity.

**Impact:** Response time reduced from **days to minutes**.

---

**Scenario B: Secret Exposure Prevention**

> A developer accidentally commits an AWS key to a public repo.

**Without Security Intelligence:** Key is exposed for weeks. Attacker finds it. Breach occurs.

**With Security Intelligence:** Secret scanning detects immediately → Alert sent → Key rotated within 1 hour.

**Impact:** **Breach prevented**.

---

**Scenario C: Compliance Audit**

> Legal team asks: "Do we have any GPL code in our proprietary products?"

**Without Security Intelligence:** Manual audit of all repos. Takes weeks. Probably incomplete.

**With Security Intelligence:** Dashboard shows: "17 repos with GPL dependencies" with exact packages listed.

**Impact:** **Audit completed in minutes, not weeks**.

---

---

## Product Requirements Document (PRD)

### 1. Overview

**RepoIntel** is an internal AI-powered enterprise web application that provides high-level, searchable, and structured intelligence across all GitHub repositories within an organization.

The system indexes repository metadata, documentation, and source code to provide:

- Clear repository context
- Architecture summaries
- Tech stack detection
- Code reference discovery
- Cross-repo search
- Audit visibility

> GitHub remains the source of truth.

---

### 2. Goals

#### Primary Goals

1. Reduce time to understand a repository by 70%
2. Improve discoverability of past work
3. Prevent duplicate implementations
4. Enable structured auditing of repo health
5. Provide AI Q&A grounded in GitHub content

#### Non-Goals

- Replace GitHub
- Replace code review
- Provide fully autonomous architecture inference
- Allow editing repo content inside the portal

---

### 3. Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | Svelte + SvelteKit (deployed on Vercel) |
| **Backend** | SvelteKit API routes, Neon Postgres, PGVector |
| **Async** | QStash |
| **AI** | OpenRouter (LLMs + embeddings) |
| **Integration** | GitHub REST + GraphQL APIs, GitHub Webhooks, GitHub App (Org-installed) |

---

### 4. Core Functional Requirements

#### 4.1 GitHub Sync

System must:

- Sync all org repos
- Store metadata
- Fetch README
- Fetch `/docs` folder
- Extract CODEOWNERS
- Store custom properties
- Update on webhook trigger
- Nightly reconcile

#### 4.2 Embedding & Retrieval

System must:

- Chunk content at file level
- Store embeddings in PGVector
- Support hybrid search
- Return citations with permalinks

#### 4.3 AI Q&A

System must:

- Support repo-scoped Q&A
- Support org-wide Q&A
- Cite sources
- Provide confidence rating
- Limit hallucination via retrieval gating

#### 4.4 Repo Overview Page

Must display:

- Repo name
- Owner team
- Lifecycle
- Last updated
- Languages
- Tech stack
- Problem solved summary
- Architecture summary
- Key files
- Documentation completeness score
- Risk flags

#### 4.5 Governance & Health

System must detect:

- Missing README
- Missing architecture doc
- No CODEOWNERS
- Inactive repo > 6 months
- Archived repos
- Duplicate similar repos

#### 4.6 Security Intelligence (Proposed Addition)

System must:

- Sync vulnerability alerts from Dependabot
- Sync secret scanning alerts from GitHub
- Calculate security score per repo
- Support security-focused AI queries
- Track vulnerability remediation SLAs
- Alert on critical security events

---

### 5. Data Model (High-Level)

**Core tables:**

- `repositories`
- `repo_metadata`
- `repo_custom_properties`
- `repo_files`
- `repo_embeddings`
- `repo_summaries`
- `repo_health_scores`
- `sync_jobs`
- `audit_flags`

**Security tables (Proposed Addition):**

- `repo_vulnerabilities`
- `repo_secrets_alerts`
- `repo_license_findings`
- `repo_security_scores`
- `security_scan_jobs`

---

### 6. Security Requirements

- Private org-only access
- GitHub App permissions least privilege
- All AI calls logged
- No source code leaves system except to model provider
- Option to restrict AI models to approved providers

---

### 7. Performance Requirements

- Repo page loads < 1.5s
- Org search < 2s
- AI response < 6s average
- Sync incremental, not full reindex

---

### 8. Metrics for Success

**Discovery & Documentation:**

- Time to understand repo reduced
- % repos with required docs
- AI answer citation rate
- Reduction in duplicate repos
- Monthly active usage

**Security (Proposed Addition):**

- Mean time to detect vulnerabilities
- Mean time to remediate vulnerabilities
- % repos with security scanning enabled
- Reduction in critical/high vulnerabilities
- Secret exposure incidents prevented
- License compliance rate

---

### 9. Phased Delivery

| Phase | Features |
|-------|----------|
| **MVP** | Repo sync, Repo page, AI per-repo Q&A, Custom property filtering |
| **V2** | Org-wide chat, Audit dashboard, Repo similarity detection |
| **V3** | Cross-repo architecture inference, Suggest-before-build intelligence |
| **Security MVP** | Dependabot sync, Security card on repo page, Vulnerability dashboard |
| **Security V2** | Secret scanning, AI security Q&A, Slack security alerts |
| **Security V3** | License compliance, Container scanning, PR security gates |

---

## Critical Advice

> Here's where most teams fail:

- They overbuild AI before enforcing documentation standards.
- They let AI generate authoritative summaries without review.
- They don't enforce custom properties.
- They don't build governance checks.

**If you want this to succeed:**

1. **Standardize first.**
2. **Index second.**
3. **Add AI third.**
