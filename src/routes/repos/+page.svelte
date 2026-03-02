<script lang="ts">
  import { onMount } from 'svelte';

  let repos: any[] = [];
  let displayedRepos: any[] = [];
  let loading = true;
  let syncing = false;
  let syncMessage = '';
  let syncError = '';
  let selectedSyncRepoId = '__all__';
  let repoLookupText = '';
  let repoLookupApplied = false;
  let filters = { owner_team: '', lifecycle: '', tech_stack: '', domain: '' };

  async function load() {
    loading = true;
    const params = new URLSearchParams();
    if (filters.owner_team) params.set('owner_team', filters.owner_team);
    if (filters.lifecycle) params.set('lifecycle', filters.lifecycle);
    if (filters.tech_stack) params.set('tech_stack', filters.tech_stack);
    if (filters.domain) params.set('domain', filters.domain);
    const r = await fetch(`/api/repos?${params}`);
    repos = await r.json();
    applyRepoLookup();
    loading = false;
  }

  onMount(load);

  function applyRepoLookup() {
    const query = repoLookupText.trim().toLowerCase();
    if (!query) {
      displayedRepos = repos;
      repoLookupApplied = false;
      return;
    }

    // Prefer exact match first (repo full name or short name), otherwise use first contains match.
    const exactMatch = repos.find((r) => {
      const fullName = String(r.full_name || '').toLowerCase();
      const name = String(r.name || '').toLowerCase();
      return fullName === query || name === query;
    });
    if (exactMatch) {
      displayedRepos = [exactMatch];
      repoLookupApplied = true;
      return;
    }

    const containsMatch = repos.find((r) => {
      const fullName = String(r.full_name || '').toLowerCase();
      const name = String(r.name || '').toLowerCase();
      return fullName.includes(query) || name.includes(query);
    });
    displayedRepos = containsMatch ? [containsMatch] : [];
    repoLookupApplied = true;
  }

  function clearRepoLookup() {
    repoLookupText = '';
    applyRepoLookup();
  }

  async function applyAllFilters() {
    await load();
  }

  async function clearAllFilters() {
    repoLookupText = '';
    filters = { owner_team: '', lifecycle: '', tech_stack: '', domain: '' };
    await load();
  }

  async function syncNow() {
    syncing = true;
    syncMessage = '';
    syncError = '';

    try {
      const selectedRepo = repos.find((r) => r.id === selectedSyncRepoId);
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

      syncMessage = data.message || 'Sync started';
      await load();
    } catch (e) {
      syncError = (e as Error).message;
    } finally {
      syncing = false;
    }
  }

  function formatDate(d: string | null) {
    if (!d) return '—';
    const date = new Date(d);
    const days = Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24));
    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    if (days < 30) return `${days}d ago`;
    if (days < 365) return `${Math.floor(days / 30)}mo ago`;
    return `${Math.floor(days / 365)}y ago`;
  }

  function getTopLanguages(repo: any): string[] {
    let stats: unknown = repo?.language_stats;
    if (typeof stats === 'string') {
      try {
        stats = JSON.parse(stats);
      } catch {
        return [];
      }
    }
    if (!stats || typeof stats !== 'object' || Array.isArray(stats)) return [];

    return Object.entries(stats as Record<string, number>)
      .sort((a, b) => Number(b[1]) - Number(a[1]))
      .slice(0, 3)
      .map(([name]) => name);
  }
</script>

<section class="page-header">
  <h1>Repo Catalog</h1>
  <p class="muted">Browse and filter your indexed repositories</p>
  <div class="page-actions">
    <select class="sync-select" bind:value={selectedSyncRepoId} disabled={syncing}>
      <option value="__all__">All repositories</option>
      {#each repos as repo}
        <option value={repo.id}>{repo.full_name}</option>
      {/each}
    </select>
    <button class="btn" on:click={syncNow} disabled={syncing}>
      {syncing ? 'Syncing...' : 'Sync Now'}
    </button>
  </div>
  {#if syncMessage}
    <p class="sync-message success">{syncMessage}</p>
  {/if}
  {#if syncError}
    <p class="sync-message error">{syncError}</p>
  {/if}
</section>

<div class="card filters-card">
  <div class="filters">
    <label>
      <span class="filter-label">Repository</span>
      <input
        type="text"
        list="repo-lookup-options"
        bind:value={repoLookupText}
        placeholder="Type repo name (e.g. owner/repo)"
      />
      <datalist id="repo-lookup-options">
        {#each repos as repo}
          <option value={repo.full_name}></option>
        {/each}
      </datalist>
    </label>
    <label>
      <span class="filter-label">Owner Team</span>
      <input type="text" bind:value={filters.owner_team} placeholder="Filter..." />
    </label>
    <label>
      <span class="filter-label">Lifecycle</span>
      <select bind:value={filters.lifecycle}>
        <option value="">All</option>
        <option value="active">Active</option>
        <option value="deprecated">Deprecated</option>
        <option value="experimental">Experimental</option>
      </select>
    </label>
    <label>
      <span class="filter-label">Tech Stack / Language</span>
      <input type="text" bind:value={filters.tech_stack} placeholder="Node, Python, TypeScript..." />
    </label>
    <label>
      <span class="filter-label">Domain</span>
      <input type="text" bind:value={filters.domain} placeholder="Filter..." />
    </label>
  </div>
  <div class="filter-actions">
    <button class="btn" on:click={applyAllFilters} disabled={loading}>Apply</button>
    <button class="btn btn-ghost" on:click={clearAllFilters} disabled={loading}>Clear</button>
  </div>
</div>

{#if loading}
  <div class="loading-state">
    <div class="loading-spinner"></div>
    <p>Loading repositories...</p>
  </div>
{:else if displayedRepos.length === 0}
  <div class="loading-state">
    <p>No repositories matched these filters.</p>
  </div>
{:else}
  <div class="repo-grid">
    {#each displayedRepos as repo}
      <a href="/repos/{repo.id}" class="card repo-card">
        <h3 class="repo-name">{repo.name}</h3>
        <p class="repo-full-name muted">{repo.full_name}</p>
        <p class="repo-summary">{repo.problem_summary || 'No summary yet'}</p>
        <div class="repo-meta">
          <span class="badge {repo.health_score >= 75 ? 'badge-success' : 'badge-warning'}">
            {repo.health_score ?? '—'}% health
          </span>
          <span class="muted repo-date">Last: {formatDate(repo.last_commit_at)}</span>
        </div>
        <div class="repo-sync muted">Synced: {formatDate(repo.last_sync_at)}</div>
        {#if getTopLanguages(repo).length}
          <div class="repo-tech">Languages: {getTopLanguages(repo).join(', ')}</div>
        {/if}
        {#if repo.tech_stack_detected?.length}
          <div class="repo-tech">Tech stack: {repo.tech_stack_detected.join(', ')}</div>
        {/if}
      </a>
    {/each}
  </div>
{/if}

<style>
  .page-header {
    margin-bottom: var(--space-xl);
  }
  .page-header h1 {
    margin: 0 0 var(--space-sm) 0;
  }
  .page-header .muted {
    margin: 0;
  }
  .page-actions {
    margin-top: var(--space-md);
    display: flex;
    gap: var(--space-sm);
    align-items: center;
    flex-wrap: wrap;
  }
  .sync-select {
    min-width: 240px;
  }
  .sync-message {
    margin: var(--space-sm) 0 0 0;
    font-size: 0.875rem;
  }
  .sync-message.success {
    color: var(--success);
  }
  .sync-message.error {
    color: var(--error);
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

  .filters-card {
    margin-bottom: var(--space-xl);
  }
  .filters {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-lg);
  }
  .filters label {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
    min-width: 140px;
    flex: 1;
  }
  .filter-label {
    font-size: 0.8125rem;
    font-weight: 500;
    color: var(--text-secondary);
  }
  .filter-actions {
    margin-top: var(--space-md);
    display: flex;
    gap: var(--space-sm);
    justify-content: flex-end;
  }

  .loading-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
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

  .repo-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
    gap: var(--space-lg);
  }
  .repo-card {
    text-decoration: none;
    color: inherit;
    display: block;
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
  .repo-full-name {
    font-size: 0.8125rem;
    margin: 0 0 var(--space-sm) 0;
  }
  .repo-summary {
    font-size: 0.875rem;
    color: var(--text-secondary);
    margin: 0 0 var(--space-md) 0;
    max-height: 3em;
    overflow: hidden;
    line-height: 1.5;
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
  .repo-sync {
    font-size: 0.75rem;
    margin-top: var(--space-xs);
  }
  .repo-tech {
    font-size: 0.75rem;
    color: var(--text-muted);
    margin-top: var(--space-sm);
  }
</style>
