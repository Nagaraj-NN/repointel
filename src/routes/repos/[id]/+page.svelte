<script lang="ts">
  import { page } from '$app/stores';
  import { onMount } from 'svelte';

  let repo: any = null;
  let security: any = null;
  let loading = true;
  let chatMessage = '';
  let chatResponse: { answer?: string; citations?: { path: string; url: string }[] } | null = null;
  let chatLoading = false;

  const id = $page.params.id;

  onMount(async () => {
    const [repoRes, secRes] = await Promise.all([
      fetch(`/api/repos/${id}`),
      fetch(`/api/repos/${id}/security`)
    ]);
    repo = await repoRes.json();
    if (repo?.error) repo = null;
    const secData = await secRes.json();
    if (!secData?.error) security = secData;
    loading = false;
  });

  function securityScoreClass(score: number | null): string {
    if (score === null) return 'badge-secondary';
    if (score >= 80) return 'badge-success';
    if (score >= 50) return 'badge-warning';
    return 'badge-danger';
  }

  function severityClass(severity: string): string {
    if (severity === 'critical') return 'sev-critical';
    if (severity === 'high') return 'sev-high';
    if (severity === 'medium') return 'sev-medium';
    return 'sev-low';
  }

  async function askRepo() {
    if (!chatMessage.trim()) return;
    chatLoading = true;
    chatResponse = null;
    try {
      const r = await fetch(`/api/repos/${id}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: chatMessage })
      });
      chatResponse = await r.json();
    } catch (e) {
      chatResponse = { answer: 'Error: ' + (e as Error).message };
    }
    chatLoading = false;
  }

  function formatDate(d: string | null) {
    if (!d) return '—';
    const date = new Date(d);
    const days = Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24));
    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    if (days < 30) return `${days}d ago`;
    return `${days}d ago`;
  }
</script>

{#if loading}
  <div class="loading-state">
    <div class="loading-spinner"></div>
    <p>Loading repository...</p>
  </div>
{:else if !repo}
  <div class="error-state">
    <p>Repo not found.</p>
    <a href="/repos" class="back-link" aria-label="Back to Repos">
      <span aria-hidden="true">←</span>
    </a>
  </div>
{:else}
  <div class="repo-header">
    <a href="/repos" class="back-link" aria-label="Back to Repos">
      <span aria-hidden="true">←</span>
    </a>
    <div>
      <h1 class="repo-title">{repo.name}</h1>
      <p class="muted repo-full-name">{repo.full_name}</p>
    </div>
    <a href={repo.url} target="_blank" rel="noopener" class="btn">GitHub ↗</a>
  </div>

  <div class="meta-line">
    {#each repo.custom_properties || [] as p}
      <span class="badge badge-secondary">{p.key}: {p.value}</span>
    {/each}
    {#if repo.last_commit_at}
      <span class="muted">Last active: {formatDate(repo.last_commit_at)}</span>
    {/if}
  </div>

  <div class="repo-grid">
    <div class="repo-main">
      <div class="card">
        <h3>Problem Summary</h3>
        <p>{repo.problem_summary || 'No summary yet.'}</p>
      </div>
      <div class="card">
        <h3>Architecture</h3>
        <p>{repo.arch_summary || 'No architecture summary yet.'}</p>
      </div>
      <div class="card">
        <h3>Tech Stack</h3>
        <p>{#each repo.tech_stack_detected || [] as t}<span class="badge badge-secondary">{t}</span> {/each}</p>
      </div>
      <div class="card">
        <h3>Key Files</h3>
        <ul>
          {#each repo.key_files || [] as f}
            <li><a href={f.url} target="_blank" rel="noopener">{f.path}</a></li>
          {/each}
        </ul>
      </div>
    </div>
    <aside class="repo-sidebar">
      <div class="card">
        <h3>Health</h3>
        <p>Score: <span class="badge {repo.health_score >= 75 ? 'badge-success' : 'badge-warning'}">{repo.health_score ?? '—'}%</span></p>
        <p>README: {repo.has_readme ? '✅' : '❌'}</p>
        <p>CODEOWNERS: {repo.has_codeowners ? '✅' : '❌'}</p>
        <p>Arch doc: {repo.has_arch_doc ? '✅' : '❌'}</p>
      </div>
      {#if repo.audit_flags?.length}
        <div class="card">
          <h3>Risk Flags</h3>
          {#each repo.audit_flags as f}
            <p><span class="badge badge-warning">{f.flag_type}</span></p>
          {/each}
        </div>
      {/if}
      <div class="card security-card">
        <h3>Security</h3>
        {#if security}
          <p>
            Score:
            <span class="badge {securityScoreClass(security.security_score)}">
              {security.security_score ?? '—'}/100
            </span>
          </p>
          <div class="vuln-counts">
            {#if security.vulnerability_count_critical > 0}
              <span class="vuln-pill sev-critical">{security.vulnerability_count_critical} Critical</span>
            {/if}
            {#if security.vulnerability_count_high > 0}
              <span class="vuln-pill sev-high">{security.vulnerability_count_high} High</span>
            {/if}
            {#if security.vulnerability_count_medium > 0}
              <span class="vuln-pill sev-medium">{security.vulnerability_count_medium} Medium</span>
            {/if}
            {#if security.vulnerability_count_low > 0}
              <span class="vuln-pill sev-low">{security.vulnerability_count_low} Low</span>
            {/if}
            {#if security.vulnerability_count_critical === 0 && security.vulnerability_count_high === 0 && security.vulnerability_count_medium === 0 && security.vulnerability_count_low === 0}
              <span class="muted" style="font-size:0.85rem">No open vulnerabilities</span>
            {/if}
          </div>
          {#if security.open_secret_alerts > 0}
            <p class="secret-alert">⚠ {security.open_secret_alerts} exposed secret{security.open_secret_alerts > 1 ? 's' : ''}</p>
          {/if}
          {#if security.vulnerabilities?.length}
            <details class="vuln-details">
              <summary>View alerts ({security.vulnerabilities.length})</summary>
              <ul class="vuln-list">
                {#each security.vulnerabilities.slice(0, 10) as v}
                  <li>
                    <span class="vuln-pill {severityClass(v.severity)}">{v.severity}</span>
                    {#if v.url}
                      <a href={v.url} target="_blank" rel="noopener">{v.package_name || v.cve_id || '#' + v.alert_number}</a>
                    {:else}
                      {v.package_name || v.cve_id || '#' + v.alert_number}
                    {/if}
                  </li>
                {/each}
              </ul>
            </details>
          {/if}
          {#if security.last_scanned_at}
            <p class="muted scan-time">Scanned {formatDate(security.last_scanned_at)}</p>
          {/if}
        {:else}
          <p class="muted" style="font-size:0.875rem">Not yet scanned.</p>
        {/if}
      </div>
      <div class="card chat-panel">
        <h3>Ask This Repo</h3>
        <textarea bind:value={chatMessage} placeholder="How do I run this locally?" rows="3"></textarea>
        <button class="btn" on:click={askRepo} disabled={chatLoading}>{chatLoading ? '...' : 'Ask'}</button>
        {#if chatResponse}
          <div class="chat-response">
            <p>{chatResponse.answer}</p>
            {#if chatResponse.citations?.length}
              <p class="citations">Sources: {#each chatResponse.citations as c}<a href={c.url} target="_blank">{c.path}</a>{/each}</p>
            {/if}
          </div>
        {/if}
      </div>
    </aside>
  </div>
{/if}

<style>
  .loading-state, .error-state {
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
  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .repo-header {
    position: relative;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: var(--space-lg);
    margin-bottom: var(--space-md);
  }
  .repo-header > div {
    flex: 1;
    min-width: 0;
  }
  .repo-header .btn {
    flex-shrink: 0;
  }
  .repo-title {
    margin: 0 0 var(--space-xs) 0;
  }
  .repo-full-name {
    margin: 0;
    font-size: 0.9375rem;
  }
  .meta-line {
    display: flex;
    gap: var(--space-sm);
    flex-wrap: wrap;
    margin-bottom: var(--space-xl);
    font-size: 0.875rem;
  }
  .repo-grid {
    display: grid;
    grid-template-columns: 1fr 320px;
    gap: var(--space-xl);
  }
  @media (max-width: 900px) {
    .repo-grid {
      grid-template-columns: 1fr;
    }
    .repo-header {
      gap: var(--space-sm);
      flex-wrap: wrap;
    }
    .back-link {
      position: static;
      order: -1;
    }
  }
  .repo-main .card {
    margin-bottom: var(--space-lg);
  }
  .repo-main .card h3 {
    margin: 0 0 var(--space-sm) 0;
    font-size: 1rem;
  }
  .repo-main .card p {
    margin: 0;
    line-height: 1.6;
  }
  .repo-sidebar .card {
    margin-bottom: var(--space-lg);
  }
  .repo-sidebar .card h3 {
    margin: 0 0 var(--space-sm) 0;
    font-size: 1rem;
  }
  .chat-panel textarea {
    margin-bottom: var(--space-sm);
    width: 100%;
  }
  .chat-response {
    margin-top: var(--space-md);
    padding-top: var(--space-md);
    border-top: 1px solid var(--border);
    font-size: 0.9rem;
  }
  .chat-response .citations {
    font-size: 0.8rem;
    color: var(--text-muted);
  }
  ul {
    margin: 0;
    padding-left: 1.25rem;
  }

  .badge-danger {
    background: rgba(239, 68, 68, 0.15);
    color: #ef4444;
  }
  .security-card h3 {
    margin: 0 0 var(--space-sm) 0;
    font-size: 1rem;
  }
  .security-card p {
    margin: 0 0 var(--space-xs) 0;
    font-size: 0.9rem;
  }
  .vuln-counts {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
    margin-bottom: var(--space-sm);
  }
  .vuln-pill {
    display: inline-block;
    padding: 0.15rem 0.55rem;
    border-radius: 999px;
    font-size: 0.75rem;
    font-weight: 600;
    letter-spacing: 0.01em;
  }
  .sev-critical { background: rgba(239, 68, 68, 0.15); color: #ef4444; }
  .sev-high     { background: rgba(249, 115, 22, 0.15); color: #f97316; }
  .sev-medium   { background: rgba(234, 179, 8, 0.15);  color: #ca8a04; }
  .sev-low      { background: rgba(100, 116, 139, 0.12); color: var(--text-secondary); }
  .secret-alert {
    font-size: 0.85rem;
    color: #ef4444;
    margin: 0 0 var(--space-xs) 0;
  }
  .vuln-details {
    margin-top: var(--space-xs);
    font-size: 0.85rem;
  }
  .vuln-details summary {
    cursor: pointer;
    color: var(--text-secondary);
    margin-bottom: var(--space-xs);
  }
  .vuln-list {
    margin: 0;
    padding-left: 0;
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
  }
  .vuln-list li {
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }
  .scan-time {
    margin-top: var(--space-xs);
    font-size: 0.8rem;
  }
  .back-link {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 2.1rem;
    height: 2.1rem;
    position: absolute;
    left: -3rem;
    top: 0.1rem;
    border-radius: 999px;
    text-decoration: none;
    color: var(--text-secondary);
    border: 1px solid var(--border);
    background: var(--bg-elevated);
    box-shadow: none;
    transition: transform var(--transition), border-color var(--transition), color var(--transition), background var(--transition);
  }
  .back-link span {
    font-size: 1.2rem;
    font-weight: 900;
    line-height: 1;
    transform: translateX(-0.08rem);
  }
  .back-link:hover {
    color: var(--text);
    border-color: var(--text-muted);
    background: rgba(127, 127, 127, 0.08);
    transform: translateY(-1px);
  }
</style>
