<script lang="ts">
  import { onMount } from 'svelte';

  let stats = { total: 0, healthy: 0, needs_attention: 0 };
  let loading = true;

  onMount(async () => {
    try {
      const r = await fetch('/api/audit');
      const data = await r.json();
      stats = data;
    } catch (e) {
      console.error(e);
    } finally {
      loading = false;
    }
  });
</script>

<section class="hero">
  <h1 class="hero-title">RepoIntel</h1>
  <p class="hero-subtitle">GitHub Repository Intelligence Platform</p>
</section>

<div class="stats-grid">
  <div class="stat-card">
    <div class="stat-icon stat-icon-total">📦</div>
    <div class="stat-content">
      <span class="stat-value">{loading ? '—' : stats.total}</span>
      <span class="stat-label">Total Repos</span>
    </div>
  </div>
  <div class="stat-card">
    <div class="stat-icon stat-icon-healthy">✓</div>
    <div class="stat-content">
      <span class="stat-value">{loading ? '—' : stats.healthy}</span>
      <span class="stat-label">Healthy</span>
    </div>
  </div>
  <div class="stat-card">
    <div class="stat-icon stat-icon-attention">!</div>
    <div class="stat-content">
      <span class="stat-value">{loading ? '—' : stats.needs_attention}</span>
      <span class="stat-label">Needs Attention</span>
    </div>
  </div>
</div>

<div class="card quick-links">
  <h2 class="section-title">Quick Links</h2>
  <div class="link-grid">
    <a href="/repos" class="link-card" target="_blank">
      <span class="link-icon">📂</span>
      <span class="link-text">Browse Repos</span>
    </a>
    <a href="/chat" class="link-card">
      <span class="link-icon">💬</span>
      <span class="link-text">Org Chat</span>
    </a>
    <a href="/audit" class="link-card">
      <span class="link-icon">📊</span>
      <span class="link-text">Audit Dashboard</span>
    </a>
  </div>
</div>

<style>
  .hero {
    margin-bottom: var(--space-2xl);
  }
  .hero-title {
    font-size: 2.5rem;
    font-weight: 700;
    letter-spacing: -0.03em;
    margin: 0 0 var(--space-sm) 0;
    background: linear-gradient(135deg, var(--text) 0%, var(--text-secondary) 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }
  .hero-subtitle {
    font-size: 1.125rem;
    color: var(--text-muted);
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

  .quick-links {
    margin-bottom: 0;
  }
  .section-title {
    margin: 0 0 var(--space-lg) 0;
    font-size: 1.25rem;
  }
  .link-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: var(--space-md);
  }
  .link-card {
    display: flex;
    align-items: center;
    gap: var(--space-md);
    padding: var(--space-md) var(--space-lg);
    background: var(--bg-muted);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    color: var(--text);
    text-decoration: none;
    font-weight: 500;
    transition: all var(--transition);
  }
  .link-card:hover {
    background: var(--accent-muted);
    border-color: var(--accent);
    color: var(--accent-hover);
  }
  .link-icon {
    font-size: 1.25rem;
  }
</style>
