export interface Organization {
  id: string;
  github_id: number;
  name: string;
  install_id: number | null;
  created_at: string;
  updated_at: string;
}

export interface Repository {
  id: string;
  org_id: string;
  github_id: number;
  name: string;
  full_name: string;
  url: string;
  default_branch: string;
  archived: boolean;
  created_at: string;
  updated_at: string;
}

export interface RepoMetadata {
  id: string;
  repo_id: string;
  description: string | null;
  language_stats: Record<string, number>;
  last_commit_at: string | null;
  star_count: number;
  fork_count: number;
}

export interface RepoCustomProperty {
  key: string;
  value: string;
}

export interface RepoSummary {
  ai_summary: string | null;
  arch_summary: string | null;
  problem_summary: string | null;
  tech_stack_detected: string[];
  generated_at: string;
}

export interface RepoHealthScore {
  has_readme: boolean;
  has_codeowners: boolean;
  has_arch_doc: boolean;
  last_active_days: number | null;
  health_score: number;
}

export interface AuditFlag {
  id: string;
  repo_id: string;
  flag_type: string;
  severity: string;
  details: string | null;
  detected_at: string;
  resolved_at: string | null;
}

export interface RepoWithDetails extends Repository {
  metadata?: RepoMetadata;
  custom_properties: RepoCustomProperty[];
  summary?: RepoSummary;
  health?: RepoHealthScore;
  audit_flags?: AuditFlag[];
  key_files?: { path: string; url: string }[];
}

export interface RepoFilters {
  owner_team?: string;
  lifecycle?: string;
  tech_stack?: string;
  domain?: string;
}
