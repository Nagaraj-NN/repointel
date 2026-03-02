-- RepoIntel Database Schema
-- Run against Neon Postgres with pgvector extension

CREATE EXTENSION IF NOT EXISTS vector;

-- Organizations (GitHub orgs with app installed)
CREATE TABLE IF NOT EXISTS organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  github_id BIGINT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  install_id BIGINT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Repositories
CREATE TABLE IF NOT EXISTS repositories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  github_id BIGINT NOT NULL,
  name TEXT NOT NULL,
  full_name TEXT NOT NULL,
  url TEXT NOT NULL,
  default_branch TEXT DEFAULT 'main',
  archived BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(org_id, github_id)
);

-- Repo metadata
CREATE TABLE IF NOT EXISTS repo_metadata (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repo_id UUID REFERENCES repositories(id) ON DELETE CASCADE,
  description TEXT,
  language_stats JSONB DEFAULT '{}',
  last_commit_at TIMESTAMPTZ,
  star_count INT DEFAULT 0,
  fork_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(repo_id)
);

-- Custom properties (owner_team, lifecycle, domain, tech_stack)
CREATE TABLE IF NOT EXISTS repo_custom_properties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repo_id UUID REFERENCES repositories(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(repo_id, key)
);

-- Raw files (README, CODEOWNERS, etc.)
CREATE TABLE IF NOT EXISTS repo_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repo_id UUID REFERENCES repositories(id) ON DELETE CASCADE,
  path TEXT NOT NULL,
  content TEXT,
  sha TEXT,
  file_type TEXT,
  last_updated TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(repo_id, path)
);

-- Docs (README, architecture, etc.)
CREATE TABLE IF NOT EXISTS repo_docs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repo_id UUID REFERENCES repositories(id) ON DELETE CASCADE,
  doc_type TEXT NOT NULL, -- README, architecture, other
  content TEXT,
  path TEXT,
  sha TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(repo_id, doc_type)
);

-- Embeddings (chunked content)
CREATE TABLE IF NOT EXISTS repo_embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repo_id UUID REFERENCES repositories(id) ON DELETE CASCADE,
  file_id UUID REFERENCES repo_files(id) ON DELETE CASCADE,
  chunk_index INT NOT NULL,
  content_chunk TEXT NOT NULL,
  embedding vector(1536),
  token_count INT DEFAULT 0,
  file_path TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_repo_embeddings_repo ON repo_embeddings(repo_id);
-- Note: ivfflat index may fail if table is empty; run after first embeddings
-- CREATE INDEX IF NOT EXISTS idx_repo_embeddings_vector ON repo_embeddings 
--   USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- AI summaries
CREATE TABLE IF NOT EXISTS repo_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repo_id UUID REFERENCES repositories(id) ON DELETE CASCADE,
  ai_summary TEXT,
  arch_summary TEXT,
  problem_summary TEXT,
  tech_stack_detected JSONB DEFAULT '[]',
  generated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(repo_id)
);

-- Health scores
CREATE TABLE IF NOT EXISTS repo_health_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repo_id UUID REFERENCES repositories(id) ON DELETE CASCADE,
  has_readme BOOLEAN DEFAULT FALSE,
  has_codeowners BOOLEAN DEFAULT FALSE,
  has_arch_doc BOOLEAN DEFAULT FALSE,
  last_active_days INT,
  health_score INT DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(repo_id)
);

-- Ingestion jobs
CREATE TABLE IF NOT EXISTS ingestion_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repo_id UUID REFERENCES repositories(id) ON DELETE CASCADE,
  status TEXT NOT NULL, -- pending, running, completed, failed
  job_type TEXT NOT NULL, -- sync, embed, summarize
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Sync logs
CREATE TABLE IF NOT EXISTS sync_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repo_id UUID REFERENCES repositories(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  payload_sha TEXT,
  processed_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Audit flags
CREATE TABLE IF NOT EXISTS audit_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repo_id UUID REFERENCES repositories(id) ON DELETE CASCADE,
  flag_type TEXT NOT NULL, -- missing_readme, no_codeowners, inactive, no_arch_doc, deprecated
  severity TEXT NOT NULL, -- low, medium, high, critical
  details TEXT,
  detected_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_repos_org ON repositories(org_id);
CREATE INDEX IF NOT EXISTS idx_audit_flags_repo ON audit_flags(repo_id);
CREATE INDEX IF NOT EXISTS idx_audit_flags_type ON audit_flags(flag_type);

-- Dependabot / code scanning CVE alerts
CREATE TABLE IF NOT EXISTS repo_vulnerabilities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repo_id UUID REFERENCES repositories(id) ON DELETE CASCADE,
  alert_number INT NOT NULL,
  cve_id TEXT,
  package_name TEXT,
  severity TEXT NOT NULL,  -- critical, high, medium, low
  state TEXT NOT NULL,     -- open, dismissed, fixed
  summary TEXT,
  url TEXT,
  detected_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(repo_id, alert_number)
);

-- Secret scanning alerts
CREATE TABLE IF NOT EXISTS repo_secrets_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repo_id UUID REFERENCES repositories(id) ON DELETE CASCADE,
  alert_number INT NOT NULL,
  secret_type TEXT,
  state TEXT NOT NULL,  -- open, resolved
  resolution TEXT,
  url TEXT,
  detected_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(repo_id, alert_number)
);

-- Computed security score per repo
CREATE TABLE IF NOT EXISTS repo_security_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repo_id UUID REFERENCES repositories(id) ON DELETE CASCADE,
  vulnerability_count_critical INT DEFAULT 0,
  vulnerability_count_high INT DEFAULT 0,
  vulnerability_count_medium INT DEFAULT 0,
  vulnerability_count_low INT DEFAULT 0,
  open_secret_alerts INT DEFAULT 0,
  security_score INT DEFAULT 100,
  last_scanned_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(repo_id)
);

-- Security scan job tracking
CREATE TABLE IF NOT EXISTS security_scan_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repo_id UUID REFERENCES repositories(id) ON DELETE CASCADE,
  status TEXT NOT NULL,  -- pending, running, completed, failed
  last_run TIMESTAMPTZ,
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Locally dismissed alerts (kept hidden from future sync views)
CREATE TABLE IF NOT EXISTS repo_security_suppressions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repo_id UUID REFERENCES repositories(id) ON DELETE CASCADE,
  alert_type TEXT NOT NULL, -- vulnerability, secret
  alert_number INT NOT NULL,
  source_state TEXT, -- original provider state (usually open)
  resolution_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(repo_id, alert_type, alert_number)
);

CREATE INDEX IF NOT EXISTS idx_repo_vulnerabilities_repo ON repo_vulnerabilities(repo_id);
CREATE INDEX IF NOT EXISTS idx_repo_vulnerabilities_severity ON repo_vulnerabilities(severity, state);
CREATE INDEX IF NOT EXISTS idx_repo_secrets_alerts_repo ON repo_secrets_alerts(repo_id);
CREATE INDEX IF NOT EXISTS idx_repo_security_scores_repo ON repo_security_scores(repo_id);
CREATE INDEX IF NOT EXISTS idx_repo_security_suppressions_repo ON repo_security_suppressions(repo_id);
