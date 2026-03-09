<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';

  type RepoInfo = { id: string; name: string; full_name: string; last_sync_at?: string | null };

  let loading = true;
  let syncing = false;
  let syncMessage = '';
  let syncError = '';
  let selectedSyncRepoId = '__all__';

  let allRepos: RepoInfo[] = [];

  let filters = {
    repo_lookup: '',
    severity_lookup: ''
  };

  let selectedDetailRepoId: string | null = null;
  let orgData: any = null;
  let repoData: any = null;

  onMount(async () => {
    await loadAllRepos();
    const params = new URLSearchParams(window.location.search);
    const repoId = params.get('repo_id');
    if (repoId) selectedDetailRepoId = repoId;
    await applyFilters(Boolean(repoId));
  });

  async function loadAllRepos() {
    const res = await fetch('/api/repos');
    const json = await res.json();
    allRepos = Array.isArray(json) ? json : [];
  }

  async function applyFilters(keepDetailView = false) {
    loading = true;
    syncMessage = '';
    syncError = '';
    orgData = null;
    repoData = null;
    if (!keepDetailView) {
      selectedDetailRepoId = null;
      setRepoQueryParam(null);
    }

    const scopedRepos = allRepos;

    const repoSecurityResponses = await Promise.all(
      scopedRepos.map(async (repo) => {
        const res = await fetch(`/api/repos/${repo.id}/security`);
        const json = await res.json();
        if (json?.error) return null;
        return { repo, security: json };
      })
    );

    const valid = repoSecurityResponses.filter(Boolean) as {
      repo: RepoInfo;
      security: any;
    }[];

    const repoTiles = valid
      .map(({ repo, security }) => {
        const topVuln = (security.vulnerabilities ?? []).find((v: any) => v.state === 'open');
        const topSecret = (security.secrets ?? []).find((s: any) => s.state === 'open');
        const topIssue = topVuln
          ? {
              type: 'Dependabot',
              label: `${String(topVuln.severity || 'low').toUpperCase()} vulnerability`,
              summary: topVuln.summary || topVuln.cve_id || topVuln.package_name || `Alert #${topVuln.alert_number}`,
              url: topVuln.url || null
            }
          : topSecret
            ? {
                type: 'Secret scanning',
                label: 'Exposed secret',
                summary: topSecret.secret_type || `Alert #${topSecret.alert_number}`,
                url: topSecret.url || null
              }
            : null;

        return {
          id: repo.id,
          name: repo.name,
          full_name: repo.full_name,
          security_score: security.security_score,
          vulnerability_count_critical: Number(security.vulnerability_count_critical ?? 0),
          vulnerability_count_high: Number(security.vulnerability_count_high ?? 0),
          vulnerability_count_medium: Number(security.vulnerability_count_medium ?? 0),
          vulnerability_count_low: Number(security.vulnerability_count_low ?? 0),
          open_secret_alerts: Number(security.open_secret_alerts ?? 0),
          last_scanned_at: security.last_scanned_at,
          top_issue: topIssue
        };
      })
      .sort((a, b) => (a.security_score ?? 100) - (b.security_score ?? 100));

    const totals = repoTiles.reduce(
      (acc, row) => {
        acc.critical += row.vulnerability_count_critical;
        acc.high += row.vulnerability_count_high;
        acc.medium += row.vulnerability_count_medium;
        acc.low += row.vulnerability_count_low;
        acc.secrets += row.open_secret_alerts;
        return acc;
      },
      { critical: 0, high: 0, medium: 0, low: 0, secrets: 0 }
    );

    orgData = {
      totals: { ...totals, repos_scanned: repoTiles.length },
      repos_with_critical: repoTiles.filter((r) => r.vulnerability_count_critical > 0).length,
      repos_with_secrets: repoTiles.filter((r) => r.open_secret_alerts > 0).length,
      repo_tiles: repoTiles
    };

    if (selectedDetailRepoId) {
      const detailMatch = valid.find((row) => row.repo.id === selectedDetailRepoId);
      if (detailMatch) repoData = detailMatch.security;
      else selectedDetailRepoId = null;
    }

    loading = false;
  }

  async function clearFilters() {
    filters = {
      repo_lookup: '',
      severity_lookup: ''
    };
    selectedDetailRepoId = null;
    setRepoQueryParam(null);
    await applyFilters();
  }

  function setRepoQueryParam(repoId: string | null) {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    if (repoId) url.searchParams.set('repo_id', repoId);
    else url.searchParams.delete('repo_id');
    window.history.replaceState({}, '', url.toString());
  }

  async function openRepoSecurity(repo: RepoInfo) {
    selectedDetailRepoId = repo.id;
    setRepoQueryParam(repo.id);
    await applyFilters(true);
  }

  function closeRepoSecurityDetail() {
    selectedDetailRepoId = null;
    setRepoQueryParam(null);
    repoData = null;
  }

  async function syncNow() {
    syncing = true;
    syncMessage = '';
    syncError = '';

    try {
      const selectedRepo = allRepos.find((r) => r.id === selectedSyncRepoId);
      const payload =
        selectedSyncRepoId === '__all__' || !selectedRepo
          ? {}
          : { repoId: selectedRepo.id, fullName: selectedRepo.full_name };

      const r = await fetch('/api/sync-now', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Failed to start sync');
      if (selectedSyncRepoId === '__all__') {
        syncMessage = 'Sync for all repositories triggered successfully';
      } else {
        syncMessage = `Sync for ${selectedRepo?.full_name ?? 'repository'} triggered successfully`;
      }
      await applyFilters();
    } catch (e) {
      syncError = (e as Error).message;
    } finally {
      syncing = false;
    }
  }

  function matchesSeverityLookup(repo: any, lookup: string): boolean {
    const raw = lookup.trim().toLowerCase();
    if (!raw) return true;

    const tokens = raw
      .split(/[,\s]+/)
      .map((t) => t.trim())
      .filter(Boolean);
    if (tokens.length === 0) return true;

    const matchesToken = (token: string): boolean => {
      if (token === 'critical') return (repo.vulnerability_count_critical ?? 0) > 0;
      if (token === 'high') return (repo.vulnerability_count_high ?? 0) > 0;
      if (token === 'medium') return (repo.vulnerability_count_medium ?? 0) > 0;
      if (token === 'low') return (repo.vulnerability_count_low ?? 0) > 0;
      if (token === 'secrets' || token === 'secret') return (repo.open_secret_alerts ?? 0) > 0;
      if (token === 'risk' || token === 'risky' || token === 'at-risk') {
        return (
          (repo.vulnerability_count_critical ?? 0) > 0 ||
          (repo.vulnerability_count_high ?? 0) > 0 ||
          (repo.vulnerability_count_medium ?? 0) > 0 ||
          (repo.vulnerability_count_low ?? 0) > 0 ||
          (repo.open_secret_alerts ?? 0) > 0
        );
      }
      if (token === 'clean') {
        return (
          (repo.vulnerability_count_critical ?? 0) === 0 &&
          (repo.vulnerability_count_high ?? 0) === 0 &&
          (repo.vulnerability_count_medium ?? 0) === 0 &&
          (repo.vulnerability_count_low ?? 0) === 0 &&
          (repo.open_secret_alerts ?? 0) === 0
        );
      }
      return false;
    };

    // OR semantics for multiple tokens, e.g. "critical high"
    return tokens.some(matchesToken);
  }

  $: filteredRepos = (orgData?.repo_tiles ?? []).filter((repo: any) => {
    const repoLookup = filters.repo_lookup.trim().toLowerCase();
    const matchesRepoLookup =
      !repoLookup ||
      String(repo.name || '').toLowerCase().includes(repoLookup) ||
      String(repo.full_name || '').toLowerCase().includes(repoLookup);
    return matchesRepoLookup && matchesSeverityLookup(repo, filters.severity_lookup);
  });

  function scoreClass(score: number | null): string {
    if (score === null) return 'score-none';
    if (score >= 80) return 'score-good';
    if (score >= 50) return 'score-warn';
    return 'score-bad';
  }

  function severityClass(severity: string): string {
    if (severity === 'critical') return 'sev-critical';
    if (severity === 'high') return 'sev-high';
    if (severity === 'medium') return 'sev-medium';
    return 'sev-low';
  }

  function formatDate(d: string | null): string {
    if (!d) return '—';
    const days = Math.floor((Date.now() - new Date(d).getTime()) / (1000 * 60 * 60 * 24));
    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    return `${days}d ago`;
  }

  function getRepoThreatLevel(repo: any): 'High' | 'Medium' | 'Low' | 'Minimal' {
    if (!repo) return 'Minimal';
    if ((repo.vulnerability_count_critical ?? 0) > 0 || (repo.open_secret_alerts ?? 0) > 0) return 'High';
    if ((repo.vulnerability_count_high ?? 0) > 0) return 'Medium';
    if ((repo.vulnerability_count_medium ?? 0) > 0 || (repo.vulnerability_count_low ?? 0) > 0) return 'Low';
    return 'Minimal';
  }

  function getPotentialThreats(repo: any): string[] {
    if (!repo) return [];
    const threats: string[] = [];
    const critical = Number(repo.vulnerability_count_critical ?? 0);
    const high = Number(repo.vulnerability_count_high ?? 0);
    const medium = Number(repo.vulnerability_count_medium ?? 0);
    const secrets = Number(repo.open_secret_alerts ?? 0);

    if (critical > 0) {
      threats.push(`${critical} critical vulnerability finding(s) may allow immediate exploitation or service compromise.`);
    }
    if (high > 0) {
      threats.push(`${high} high-severity vulnerability finding(s) may enable privilege escalation or data exposure.`);
    }
    if (secrets > 0) {
      threats.push(`${secrets} open secret alert(s) indicate potential credential leakage and unauthorized access risk.`);
    }
    if (medium > 0) {
      threats.push(`${medium} medium-severity finding(s) should be remediated to reduce future attack surface.`);
    }

    if (!repo.last_scanned_at) {
      threats.push('No completed security scan was detected for this repo. Current risk posture may be outdated.');
    } else {
      const days = Math.floor((Date.now() - new Date(repo.last_scanned_at).getTime()) / (1000 * 60 * 60 * 24));
      if (days > 30) {
        threats.push(`Last scan is ${days} days old. Newly introduced vulnerabilities may not be reflected.`);
      }
    }

    if (threats.length === 0) {
      threats.push('No active security findings detected. Continue periodic scans to maintain coverage.');
    }
    return threats;
  }

  function openSecurityDetail(repoId: string) {
    goto(`/security/${repoId}`);
  }

  function onRepoCardKeydown(event: KeyboardEvent, repoId: string) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openSecurityDetail(repoId);
    }
  }

  // If user navigates to /security without repo_id, reset detail mode.
  // Read from window.location so history.replaceState updates are respected immediately.
  $: {
    const repoIdFromUrl =
      typeof window !== 'undefined'
        ? new URLSearchParams(window.location.search).get('repo_id')
        : $page.url.searchParams.get('repo_id');
    if ($page.url.pathname === '/security' && !repoIdFromUrl && selectedDetailRepoId) {
      selectedDetailRepoId = null;
      repoData = null;
    }
  }
</script>

{#if !selectedDetailRepoId}
  <div class="page-header">
    <div>
      <h1>Security Dashboard</h1>
      <p class="muted">Vulnerability and secret scanning posture by selected repository scope</p>
    </div>
    <div class="page-actions">
      <select class="sync-select" bind:value={selectedSyncRepoId} disabled={syncing}>
        <option value="__all__">All repositories</option>
        {#each allRepos as repo}
          <option value={repo.id}>{repo.full_name}</option>
        {/each}
      </select>
      <button class="btn" on:click={syncNow} disabled={syncing}>
        {syncing ? 'Syncing...' : 'Sync Now'}
      </button>
    </div>
  </div>
  {#if syncMessage}
    <p class="sync-message success">{syncMessage}</p>
  {/if}
  {#if syncError}
    <p class="sync-message error">{syncError}</p>
  {/if}

  <div class="card filters-card">
    <div class="filters">
      <label>
        <span class="filter-label">Repository</span>
        <input
          type="text"
          list="security-repo-lookup-options"
          bind:value={filters.repo_lookup}
          placeholder="Type repo name (e.g. owner/repo)"
        />
        <datalist id="security-repo-lookup-options">
          {#each allRepos as repo}
            <option value={repo.full_name}></option>
          {/each}
        </datalist>
      </label>
      <label>
        <span class="filter-label">Severity Lookup</span>
        <input
          type="text"
          list="security-severity-options"
          bind:value={filters.severity_lookup}
          placeholder="critical, high, medium, low, secrets"
        />
        <datalist id="security-severity-options">
          <option value="critical"></option>
          <option value="high"></option>
          <option value="medium"></option>
          <option value="low"></option>
          <option value="secrets"></option>
          <option value="at-risk"></option>
          <option value="clean"></option>
        </datalist>
      </label>
      <div class="filter-actions">
        <button class="btn" on:click={() => applyFilters()} disabled={loading}>Apply</button>
        <button class="btn btn-ghost" on:click={clearFilters} disabled={loading}>Clear</button>
      </div>
    </div>
  </div>
{/if}

{#if loading}
  <div class="loading-state">
    <div class="loading-spinner"></div>
    <p>Loading security data...</p>
  </div>
{:else if !orgData && !repoData}
  <div class="empty-state">
    <p>No security data available. Run a sync to trigger scans.</p>
  </div>
{:else if selectedDetailRepoId && repoData}
  <div class="detail-header">
    <button class="btn btn-ghost" on:click={closeRepoSecurityDetail}>← Back to security tiles</button>
  </div>
  <div class="summary-grid">
    <div class="stat-card stat-neutral">
      <div class="stat-value">{repoData.security_score ?? '—'}</div>
      <div class="stat-label">Security Score</div>
    </div>
    <div class="stat-card stat-critical">
      <div class="stat-value">{repoData.vulnerability_count_critical}</div>
      <div class="stat-label">Critical Vulns</div>
    </div>
    <div class="stat-card stat-high">
      <div class="stat-value">{repoData.vulnerability_count_high}</div>
      <div class="stat-label">High Vulns</div>
    </div>
    <div class="stat-card stat-medium">
      <div class="stat-value">{repoData.vulnerability_count_medium}</div>
      <div class="stat-label">Medium Vulns</div>
    </div>
    <div class="stat-card stat-secrets">
      <div class="stat-value">{repoData.open_secret_alerts}</div>
      <div class="stat-label">Exposed Secrets</div>
    </div>
    <div class="stat-card stat-neutral">
      <div class="stat-value">{formatDate(repoData.last_scanned_at)}</div>
      <div class="stat-label">Last Scanned</div>
    </div>
  </div>

  <div class="card threat-summary-card">
    <h2>Security Findings</h2>
    <p class="muted">
      Threat level:
      <span class="threat-level threat-level-{getRepoThreatLevel(repoData).toLowerCase()}">
        {getRepoThreatLevel(repoData)}
      </span>
    </p>
    <ul class="threat-list">
      {#each getPotentialThreats(repoData) as threat}
        <li>{threat}</li>
      {/each}
    </ul>
  </div>

  <div class="table-header">
    <h2>Vulnerability Alerts</h2>
  </div>
  {#if (repoData.vulnerabilities ?? []).length === 0}
    <div class="empty-state card">
      <p>No vulnerabilities found for this repository.</p>
    </div>
  {:else}
    <div class="table-wrap card">
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Package</th>
            <th>CVE</th>
            <th>Severity</th>
            <th>State</th>
            <th>Detected</th>
          </tr>
        </thead>
        <tbody>
          {#each repoData.vulnerabilities as v}
            <tr>
              <td>{v.alert_number}</td>
              <td>{v.package_name || '—'}</td>
              <td>{v.cve_id || '—'}</td>
              <td><span class="score-badge {severityClass(v.severity)}">{v.severity}</span></td>
              <td>{v.state}</td>
              <td class="muted date-cell">{formatDate(v.detected_at)}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}

  <div class="table-header">
    <h2>Secret Alerts</h2>
  </div>
  {#if (repoData.secrets ?? []).length === 0}
    <div class="empty-state card">
      <p>No secret alerts found for this repository.</p>
    </div>
  {:else}
    <div class="table-wrap card">
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Secret Type</th>
            <th>State</th>
            <th>Detected</th>
          </tr>
        </thead>
        <tbody>
          {#each repoData.secrets as s}
            <tr>
              <td>{s.alert_number}</td>
              <td>{s.secret_type || '—'}</td>
              <td>{s.state}</td>
              <td class="muted date-cell">{formatDate(s.detected_at)}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
{:else}
  <div class="summary-grid">
    <div class="stat-card stat-critical">
      <div class="stat-value">{orgData.totals.critical}</div>
      <div class="stat-label">Critical Vulns</div>
    </div>
    <div class="stat-card stat-high">
      <div class="stat-value">{orgData.totals.high}</div>
      <div class="stat-label">High Vulns</div>
    </div>
    <div class="stat-card stat-medium">
      <div class="stat-value">{orgData.totals.medium}</div>
      <div class="stat-label">Medium Vulns</div>
    </div>
    <div class="stat-card stat-secrets">
      <div class="stat-value">{orgData.totals.secrets}</div>
      <div class="stat-label">Exposed Secrets</div>
    </div>
    <div class="stat-card stat-neutral">
      <div class="stat-value">{orgData.repos_with_critical}</div>
      <div class="stat-label">Repos w/ Critical</div>
    </div>
    <div class="stat-card stat-neutral">
      <div class="stat-value">{orgData.repos_with_secrets}</div>
      <div class="stat-label">Repos w/ Secrets</div>
    </div>
  </div>

  <div class="table-header">
    <h2>Repositories</h2>
    <span class="muted">{filteredRepos.length} repos</span>
  </div>

  {#if filteredRepos.length === 0}
    <div class="empty-state card">
      <p>No repositories matched this scope.</p>
    </div>
  {:else}
    <div class="repo-grid">
      {#each filteredRepos as repo}
        <div
          class="card repo-card"
          role="link"
          tabindex="0"
          on:click={() => openSecurityDetail(repo.id)}
          on:keydown={(event) => onRepoCardKeydown(event, repo.id)}
        >
          <div class="repo-card-head">
            <h3 class="repo-name">
              <a class="repo-link-primary" href="/security/{repo.id}" on:click|stopPropagation>{repo.name}</a>
            </h3>
            <a class="repo-detail-link" href="/security/{repo.id}" on:click|stopPropagation>View details</a>
          </div>
          <p class="repo-full-name muted">{repo.full_name}</p>
          <div class="repo-meta">
            <span class="score-badge {scoreClass(repo.security_score)}">
              Score: {repo.security_score ?? '—'}
            </span>
            <span class="muted repo-date">Scanned: {formatDate(repo.last_scanned_at)}</span>
          </div>
          {#if repo.top_issue}
            <div class="top-issue">
              <p class="top-issue-label">
                {repo.top_issue.type}: <strong>{repo.top_issue.label}</strong>
              </p>
              <p class="top-issue-summary">{repo.top_issue.summary}</p>
              {#if repo.top_issue.url}
                <a
                  class="top-issue-link"
                  href={repo.top_issue.url}
                  target="_blank"
                  rel="noopener"
                  on:click|stopPropagation
                >
                  Open alert ↗
                </a>
              {/if}
            </div>
          {:else}
            <p class="top-issue-summary muted">No open findings in latest scan.</p>
          {/if}
          <p class="repo-threat-line">
            Threat level:
            <span class="threat-level threat-level-{getRepoThreatLevel(repo).toLowerCase()}">
              {getRepoThreatLevel(repo)}
            </span>
          </p>
          <div class="security-counts">
            <span class="sev-pill sev-critical">{repo.vulnerability_count_critical || 0} Critical</span>
            <span class="sev-pill sev-high">{repo.vulnerability_count_high || 0} High</span>
            <span class="sev-pill sev-medium">{repo.vulnerability_count_medium || 0} Medium</span>
            <span class="sev-pill sev-low">{repo.vulnerability_count_low || 0} Low</span>
            <span class="sev-pill {repo.open_secret_alerts > 0 ? 'sev-critical' : 'sev-low'}">{repo.open_secret_alerts || 0} Secrets</span>
          </div>
        </div>
      {/each}
    </div>
  {/if}
{/if}

<style>
  .page-header {
    margin-bottom: var(--space-sm);
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: var(--space-md);
    flex-wrap: wrap;
  }
  .page-header h1 {
    margin: 0 0 var(--space-xs) 0;
  }
  .page-header p {
    margin: 0;
    font-size: 0.9375rem;
  }
  .page-actions {
    display: flex;
    gap: var(--space-sm);
    align-items: center;
    flex-wrap: wrap;
  }
  .sync-select {
    min-width: 240px;
  }
  .sync-message {
    margin: 0 0 var(--space-sm) 0;
    font-size: 0.875rem;
  }
  .sync-message.success { color: var(--success); }
  .sync-message.error { color: var(--error); }

  .filters-card {
    margin-bottom: var(--space-xl);
  }
  .filters {
    display: grid;
    grid-template-columns: minmax(260px, 420px) minmax(220px, 320px) auto;
    gap: var(--space-md);
    align-items: end;
    justify-content: start;
  }
  .filters label {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
    min-width: 0;
    flex: initial;
  }
  .filter-label {
    font-size: 0.8125rem;
    font-weight: 500;
    color: var(--text-secondary);
  }
  .filter-actions {
    display: flex;
    gap: var(--space-sm);
    justify-content: flex-end;
    align-self: end;
  }
  .btn-ghost {
    background: transparent;
    border: 1px solid var(--border);
    color: var(--text-secondary);
  }
  .btn-ghost:hover {
    border-color: var(--accent);
    color: var(--accent);
    background: var(--accent-muted);
  }

  @media (max-width: 1100px) {
    .filters {
      grid-template-columns: 1fr;
      align-items: stretch;
    }
    .filter-actions {
      justify-content: flex-start;
    }
  }

  .loading-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-md);
    padding: var(--space-3xl);
    color: var(--text-muted);
  }
  .loading-spinner {
    width: 32px;
    height: 32px;
    border: 3px solid var(--border);
    border-top-color: var(--accent);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  .empty-state {
    padding: var(--space-2xl);
    text-align: center;
    color: var(--text-muted);
  }
  .detail-header {
    margin-bottom: var(--space-md);
  }

  .summary-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
    gap: var(--space-md);
    margin-bottom: var(--space-2xl);
  }
  .stat-card {
    background: var(--bg-elevated);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    padding: var(--space-lg);
    text-align: center;
  }
  .stat-value {
    font-size: 2rem;
    font-weight: 700;
    line-height: 1;
    margin-bottom: 0.35rem;
  }
  .stat-label {
    font-size: 0.8rem;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .stat-critical .stat-value { color: #ef4444; }
  .stat-high    .stat-value { color: #f97316; }
  .stat-medium  .stat-value { color: #ca8a04; }
  .stat-secrets .stat-value { color: #ef4444; }
  .stat-neutral .stat-value { color: var(--text); }

  .table-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: var(--space-md);
  }
  .table-header h2 {
    margin: 0;
    font-size: 1.1rem;
  }

  .repo-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
    gap: var(--space-lg);
  }
  .repo-card {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
    transition: all var(--transition);
  }
  .repo-card:hover {
    border-color: var(--accent);
    box-shadow: var(--shadow);
    transform: translateY(-2px);
  }
  .repo-name {
    margin: 0 0 var(--space-xs) 0;
    font-size: 1.125rem;
  }
  .repo-card-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-sm);
  }
  .repo-link-primary {
    color: inherit;
    text-decoration: none;
  }
  .repo-link-primary:hover {
    color: var(--accent);
  }
  .repo-detail-link {
    font-size: 0.78rem;
    color: var(--text-secondary);
    text-decoration: none;
  }
  .repo-detail-link:hover {
    color: var(--accent);
  }
  .repo-full-name {
    font-size: 0.8125rem;
    margin: 0 0 var(--space-md) 0;
  }
  .repo-meta {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-top: var(--space-md);
    padding-top: var(--space-md);
    border-top: 1px solid var(--border);
    font-size: 0.8125rem;
  }
  .repo-date {
    font-size: 0.75rem;
  }
  .repo-threat-line {
    margin: var(--space-sm) 0 0 0;
    font-size: 0.82rem;
    color: var(--text-secondary);
  }
  .top-issue {
    margin-top: var(--space-sm);
    padding: var(--space-sm);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    background: var(--bg-elevated);
  }
  .top-issue-label {
    margin: 0 0 0.25rem 0;
    font-size: 0.78rem;
    color: var(--text-secondary);
  }
  .top-issue-summary {
    margin: 0;
    font-size: 0.83rem;
    line-height: 1.4;
  }
  .top-issue-link {
    display: inline-block;
    margin-top: 0.4rem;
    font-size: 0.78rem;
    text-decoration: none;
    color: var(--accent);
  }
  .top-issue-link:hover {
    text-decoration: underline;
  }
  .threat-level {
    display: inline-block;
    margin-left: 0.35rem;
    padding: 0.1rem 0.5rem;
    border-radius: 999px;
    font-size: 0.72rem;
    font-weight: 700;
    letter-spacing: 0.02em;
    text-transform: uppercase;
  }
  .threat-level-high { color: #ef4444; background: rgba(239, 68, 68, 0.12); }
  .threat-level-medium { color: #f97316; background: rgba(249, 115, 22, 0.12); }
  .threat-level-low { color: #ca8a04; background: rgba(234, 179, 8, 0.12); }
  .threat-level-minimal { color: #22c55e; background: rgba(34, 197, 94, 0.12); }

  .threat-summary-card {
    margin-bottom: var(--space-lg);
  }
  .threat-summary-card h2 {
    margin: 0 0 var(--space-xs) 0;
    font-size: 1.05rem;
  }
  .threat-summary-card p {
    margin: 0 0 var(--space-sm) 0;
    font-size: 0.88rem;
  }
  .threat-list {
    margin: 0;
    padding-left: 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    font-size: 0.88rem;
    color: var(--text-secondary);
  }
  .security-counts {
    margin-top: var(--space-sm);
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
  }
  .sev-pill {
    display: inline-block;
    padding: 0.15rem 0.55rem;
    border-radius: 999px;
    font-size: 0.75rem;
    font-weight: 600;
  }
  .table-wrap {
    overflow-x: auto;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.9rem;
  }
  th {
    text-align: left;
    padding: var(--space-sm) var(--space-md);
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-muted);
    border-bottom: 1px solid var(--border);
    white-space: nowrap;
  }
  td {
    padding: var(--space-sm) var(--space-md);
    border-bottom: 1px solid var(--border);
    vertical-align: middle;
  }
  tr:last-child td {
    border-bottom: none;
  }
  tr:hover td {
    background: var(--bg-hover, rgba(255,255,255,0.03));
  }

  .repo-link {
    display: block;
    font-weight: 500;
    color: var(--text);
    text-decoration: none;
  }
  .repo-link:hover { color: var(--accent); }
  .repo-full {
    display: block;
    font-size: 0.8rem;
  }

  .score-badge {
    display: inline-block;
    padding: 0.2rem 0.6rem;
    border-radius: 999px;
    font-size: 0.8rem;
    font-weight: 600;
  }
  .score-good { background: rgba(34, 197, 94, 0.15); color: #22c55e; }
  .score-warn { background: rgba(234, 179, 8, 0.15);  color: #ca8a04; }
  .score-bad  { background: rgba(239, 68, 68, 0.15);  color: #ef4444; }
  .score-none { background: var(--bg-elevated); color: var(--text-muted); }

  .num-cell {
    text-align: center;
    font-variant-numeric: tabular-nums;
    font-size: 0.875rem;
  }
  .sev-critical { color: #ef4444; font-weight: 600; }
  .sev-high     { color: #f97316; font-weight: 600; }
  .sev-medium   { color: #ca8a04; font-weight: 600; }

  .date-cell {
    font-size: 0.8rem;
    white-space: nowrap;
  }
</style>
