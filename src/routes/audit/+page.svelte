<script lang="ts">
  import { onMount } from 'svelte';

  let data: {
    total: number;
    healthy: number;
    needs_attention: number;
    flags: { flag_type: string; count: number; repos: string[] }[];
  } = { total: 0, healthy: 0, needs_attention: 0, flags: [] };

  onMount(async () => {
    const r = await fetch('/api/audit');
    data = await r.json();
  });

  function formatFlag(s: string) {
    return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }
</script>

<section class="page-header">
  <h1>Audit Dashboard</h1>
  <p class="muted">Repository health overview and flagged issues</p>
</section>

<div class="stats-grid">
  <div class="stat-card">
    <div class="stat-icon stat-icon-total">📦</div>
    <div class="stat-content">
      <span class="stat-value">{data.total}</span>
      <span class="stat-label">Total Repos</span>
    </div>
  </div>
  <div class="stat-card">
    <div class="stat-icon stat-icon-healthy">✓</div>
    <div class="stat-content">
      <span class="stat-value">{data.healthy}</span>
      <span class="stat-label">Healthy</span>
    </div>
  </div>
  <div class="stat-card">
    <div class="stat-icon stat-icon-attention">!</div>
    <div class="stat-content">
      <span class="stat-value">{data.needs_attention}</span>
      <span class="stat-label">Needs Attention</span>
    </div>
  </div>
</div>

<div class="card flags-card">
  <h2 class="section-title">Flags by Type</h2>
  <div class="table-wrapper">
    <table>
      <thead>
        <tr>
          <th>Flag</th>
          <th>Count</th>
          <th>Repos</th>
        </tr>
      </thead>
      <tbody>
        {#each data.flags || [] as f}
          <tr>
            <td>{formatFlag(f.flag_type)}</td>
            <td>{f.count}</td>
            <td>
              {#each (f.repos || []).slice(0, 5) as repo}
                <a href="https://github.com/{repo}" target="_blank" rel="noopener">{repo}</a>
                {#if f.repos.indexOf(repo) < Math.min(4, (f.repos?.length || 0) - 1)}, {/if}
              {/each}
              {#if (f.repos?.length || 0) > 5}
                <span class="muted">+{(f.repos?.length || 0) - 5} more</span>
              {/if}
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
</div>

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

  .stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: var(--space-lg);
    margin-bottom: var(--space-2xl);
  }
  .stat-card {
    display: flex;
    align-items: center;
    gap: var(--space-lg);
    padding: var(--space-lg);
    background: var(--bg-elevated);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-sm);
    transition: all var(--transition);
  }
  .stat-card:hover {
    box-shadow: var(--shadow);
    border-color: var(--accent);
    transform: translateY(-2px);
  }
  .stat-icon {
    width: 48px;
    height: 48px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.5rem;
    border-radius: var(--radius);
  }
  .stat-icon-total {
    background: var(--accent-muted);
    color: var(--accent);
  }
  .stat-icon-healthy {
    background: #d1fae5;
    color: var(--success);
  }
  .stat-icon-attention {
    background: #fef3c7;
    color: var(--warning);
  }
  .stat-content {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
  .stat-value {
    font-size: 1.75rem;
    font-weight: 700;
    color: var(--text);
  }
  .stat-label {
    font-size: 0.875rem;
    color: var(--text-muted);
  }

  .flags-card {
    overflow: hidden;
  }
  .section-title {
    margin: 0 0 var(--space-lg) 0;
    font-size: 1.25rem;
  }
  .table-wrapper {
    overflow-x: auto;
  }
  table {
    width: 100%;
    border-collapse: collapse;
  }
  th, td {
    padding: 0.75rem 1rem;
    text-align: left;
    border-bottom: 1px solid var(--border);
  }
  th {
    color: var(--text-muted);
    font-weight: 500;
    font-size: 0.8125rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  tr:hover td {
    background: var(--bg-muted);
  }
  td a {
    margin-right: 0.25rem;
  }
</style>
