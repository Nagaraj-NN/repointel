export async function ensureSecuritySuppressionTable(db: any): Promise<void> {
  await db`
    CREATE TABLE IF NOT EXISTS repo_security_suppressions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      repo_id UUID REFERENCES repositories(id) ON DELETE CASCADE,
      alert_type TEXT NOT NULL, -- vulnerability, secret
      alert_number INT NOT NULL,
      source_state TEXT,
      resolution_reason TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(repo_id, alert_type, alert_number)
    )
  `;

  await db`
    CREATE INDEX IF NOT EXISTS idx_repo_security_suppressions_repo
    ON repo_security_suppressions(repo_id)
  `;
}

