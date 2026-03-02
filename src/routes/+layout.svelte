<script lang="ts">
  import '$lib/app.css';
  import { page } from '$app/stores';
</script>

<header class="header">
  <a href="/" class="logo">
    <span class="logo-icon">◆</span>
    RepoIntel
  </a>
  <nav class="nav">
    <a href="/" class="nav-link" class:active={$page.url.pathname === '/'}>Dashboard</a>
    <a href="/repos" class="nav-link" class:active={$page.url.pathname.startsWith('/repos')}>Repos</a>
    <a href="/chat" class="nav-link" class:active={$page.url.pathname === '/chat'}>Org Chat</a>
    <a href="/audit" class="nav-link" class:active={$page.url.pathname === '/audit'}>Audit</a>
    <a href="/security" class="nav-link" class:active={$page.url.pathname.startsWith('/security')}>Security</a>
  </nav>
</header>

<main class="main">
  <slot />
</main>

<style>
  .header {
    position: sticky;
    top: 0;
    z-index: 100;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-lg);
    padding: var(--space-md) var(--space-xl);
    background: var(--bg-elevated);
    border-bottom: 1px solid var(--border);
    box-shadow: var(--shadow-sm);
  }

  .logo {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 1.25rem;
    font-weight: 700;
    color: var(--text);
    text-decoration: none;
    letter-spacing: -0.03em;
    transition: color var(--transition);
  }
  .logo:hover {
    color: var(--accent);
  }
  .logo-icon {
    color: var(--accent);
    font-size: 1.1em;
  }

  .nav {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
  }

  .nav-link {
    padding: 0.5rem 1rem;
    font-size: 0.9375rem;
    font-weight: 500;
    color: var(--text-secondary);
    text-decoration: none;
    border-radius: var(--radius);
    transition: all var(--transition);
  }
  .nav-link:hover {
    color: var(--accent);
    background: var(--accent-muted);
  }
  .nav-link.active {
    color: var(--accent);
    background: var(--accent-muted);
  }

  .main {
    max-width: 1200px;
    margin: 0 auto;
    padding: var(--space-2xl) var(--space-xl);
  }

  @media (max-width: 640px) {
    .header {
      flex-direction: column;
      align-items: stretch;
      padding: var(--space-md);
    }
    .nav {
      justify-content: flex-start;
      overflow-x: auto;
      padding-bottom: 2px;
    }
    .main {
      padding: var(--space-lg) var(--space-md);
    }
  }
</style>
