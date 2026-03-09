<script lang="ts">
  import { page } from '$app/stores';
  import { onMount } from 'svelte';

  let loading = true;
  let error = '';
  let repo: any = null;
  let security: any = null;
  let issueChatOpen = false;
  let issueChatTarget: any = null;
  let issueChatPrompt = 'Explain root cause, impact, and precise remediation steps.';
  let issueChatResponse = '';
  let issueChatLoading = false;
  let issueChatError = '';
  let resolvingKeys = new Set<string>();

  const id = $page.params.id;

  onMount(async () => {
    await loadPageData();
  });

  async function loadPageData() {
    try {
      const [repoRes, securityRes] = await Promise.all([
        fetch(`/api/repos/${id}`),
        fetch(`/api/repos/${id}/security`)
      ]);

      const repoJson = await repoRes.json();
      const securityJson = await securityRes.json();

      if (repoJson?.error) throw new Error(repoJson.error);
      if (securityJson?.error) throw new Error(securityJson.error);

      repo = repoJson;
      security = securityJson;
    } catch (e) {
      error = (e as Error).message || 'Failed to load security details';
    } finally {
      loading = false;
    }
  }

  function formatDate(d: string | null): string {
    if (!d) return '—';
    const days = Math.floor((Date.now() - new Date(d).getTime()) / (1000 * 60 * 60 * 24));
    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    return `${days}d ago`;
  }

  function getThreatLevel(data: any): 'High' | 'Medium' | 'Low' | 'Minimal' {
    if (!data) return 'Minimal';
    if ((data.vulnerability_count_critical ?? 0) > 0 || (data.open_secret_alerts ?? 0) > 0) return 'High';
    if ((data.vulnerability_count_high ?? 0) > 0) return 'Medium';
    if ((data.vulnerability_count_medium ?? 0) > 0 || (data.vulnerability_count_low ?? 0) > 0) return 'Low';
    return 'Minimal';
  }

  function severityClass(severity: string): string {
    if (severity === 'critical') return 'sev-critical';
    if (severity === 'high') return 'sev-high';
    if (severity === 'medium') return 'sev-medium';
    return 'sev-low';
  }

  function getIssueKey(alertType: 'vulnerability' | 'secret', alertNumber: number): string {
    return `${alertType}:${alertNumber}`;
  }

  function openIssueChat(alertType: 'vulnerability' | 'secret', issue: any) {
    issueChatTarget = { alertType, ...issue };
    issueChatResponse = '';
    issueChatError = '';
    issueChatOpen = true;
  }

  function closeIssueChat() {
    issueChatOpen = false;
    issueChatLoading = false;
    issueChatResponse = '';
    issueChatError = '';
    issueChatTarget = null;
  }

  function onModalEscape(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      closeIssueChat();
    }
  }

  async function submitIssueChat() {
    if (!issueChatTarget || !issueChatPrompt.trim()) return;
    issueChatLoading = true;
    issueChatError = '';
    issueChatResponse = '';
    try {
      const issueTypeLabel =
        issueChatTarget.alertType === 'vulnerability' ? 'Dependabot vulnerability' : 'Secret scanning alert';
      const contextLines =
        issueChatTarget.alertType === 'vulnerability'
          ? [
              `Alert #${issueChatTarget.alert_number}`,
              `Package: ${issueChatTarget.package_name || 'n/a'}`,
              `CVE: ${issueChatTarget.cve_id || 'n/a'}`,
              `Severity: ${issueChatTarget.severity || 'n/a'}`,
              `Summary: ${issueChatTarget.summary || 'n/a'}`
            ]
          : [
              `Alert #${issueChatTarget.alert_number}`,
              `Secret type: ${issueChatTarget.secret_type || 'n/a'}`,
              `State: ${issueChatTarget.state || 'n/a'}`,
              `Resolution: ${issueChatTarget.resolution || 'n/a'}`
            ];

      const message = [
        `Analyze this ${issueTypeLabel} in repository ${repo?.full_name}:`,
        ...contextLines,
        '',
        `User request: ${issueChatPrompt.trim()}`
      ].join('\n');

      const r = await fetch(`/api/repos/${id}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message })
      });
      const data = await r.json();
      if (!r.ok || data?.error) throw new Error(data?.error || 'Failed to chat on issue');
      issueChatResponse = data.answer || 'No response returned.';
    } catch (e) {
      issueChatError = (e as Error).message;
    } finally {
      issueChatLoading = false;
    }
  }

  async function markIssueResolved(alertType: 'vulnerability' | 'secret', alertNumber: number) {
    const key = getIssueKey(alertType, alertNumber);
    resolvingKeys = new Set([...resolvingKeys, key]);
    try {
      const r = await fetch(`/api/repos/${id}/security/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          alertType,
          alertNumber,
          reason: 'Marked resolved from RepoIntel security page'
        })
      });
      const data = await r.json();
      if (!r.ok || data?.error) throw new Error(data?.error || 'Failed to resolve issue');
      await loadPageData();
    } catch (e) {
      error = (e as Error).message || 'Failed to resolve issue';
    } finally {
      resolvingKeys = new Set([...resolvingKeys].filter((k) => k !== key));
    }
  }
</script>

<svelte:window on:keydown={onModalEscape} />

{#if loading}
  <div class="loading-state">
    <div class="loading-spinner"></div>
    <p>Loading security details...</p>
  </div>
{:else if error}
  <div class="empty-state card">
    <p>{error}</p>
    <a class="back-link" href="/security" aria-label="Back to Security">
      <span aria-hidden="true">←</span>
    </a>
  </div>
{:else}
  <div class="repo-header">
    <a class="back-link" href="/security" aria-label="Back to Security">
      <span aria-hidden="true">←</span>
    </a>
    <div class="page-header">
      <h1>{repo?.name}</h1>
      <p class="muted">{repo?.full_name}</p>
    </div>
    {#if repo?.url}
      <a class="btn" href={repo.url} target="_blank" rel="noopener">GitHub ↗</a>
    {/if}
  </div>

  <div class="summary-grid">
    <div class="stat-card stat-neutral">
      <div class="stat-value">{security?.security_score ?? '—'}</div>
      <div class="stat-label">Security Score</div>
    </div>
    <div class="stat-card stat-critical">
      <div class="stat-value">{security?.vulnerability_count_critical ?? 0}</div>
      <div class="stat-label">Critical Vulns</div>
    </div>
    <div class="stat-card stat-high">
      <div class="stat-value">{security?.vulnerability_count_high ?? 0}</div>
      <div class="stat-label">High Vulns</div>
    </div>
    <div class="stat-card stat-medium">
      <div class="stat-value">{security?.vulnerability_count_medium ?? 0}</div>
      <div class="stat-label">Medium Vulns</div>
    </div>
    <div class="stat-card stat-secrets">
      <div class="stat-value">{security?.open_secret_alerts ?? 0}</div>
      <div class="stat-label">Exposed Secrets</div>
    </div>
    <div class="stat-card stat-neutral">
      <div class="stat-value">{formatDate(security?.last_scanned_at ?? null)}</div>
      <div class="stat-label">Last Scanned</div>
    </div>
  </div>

  <div class="card threat-summary-card">
    <h2>Security Findings</h2>
    <p class="muted">
      Threat level:
      <span class="threat-level threat-level-{getThreatLevel(security).toLowerCase()}">
        {getThreatLevel(security)}
      </span>
    </p>
  </div>

  <div class="table-header">
    <h2>Vulnerability Alerts</h2>
  </div>
  {#if (security?.vulnerabilities ?? []).length === 0}
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
            <th>Details</th>
            <th>State</th>
            <th>Detected</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {#each security.vulnerabilities as v}
            <tr>
              <td>{v.alert_number}</td>
              <td>{v.package_name || '—'}</td>
              <td>
                {#if v.cve_id}
                  <a href={"https://nvd.nist.gov/vuln/detail/" + v.cve_id} target="_blank" rel="noopener">{v.cve_id}</a>
                {:else}
                  —
                {/if}
              </td>
              <td><span class="sev-pill {severityClass(v.severity)}">{v.severity}</span></td>
              <td class="issue-summary-cell">
                <p class="issue-summary">
                  {@html v.summary || 'No summary provided by provider.'}
                </p>
                {#if v.url}
                  <a class="issue-source-link" href={v.url} target="_blank" rel="noopener">Open Dependabot alert ↗</a>
                {/if}
              </td>
              <td>{v.state}</td>
              <td class="muted date-cell">{formatDate(v.detected_at)}</td>
              <td>
                <div class="row-actions">
                  <button class="btn-small action-chat" on:click={() => openIssueChat('vulnerability', v)}>Chat</button>
                  <button
                    class="btn-small btn-resolve"
                    on:click={() => markIssueResolved('vulnerability', v.alert_number)}
                    disabled={resolvingKeys.has(getIssueKey('vulnerability', v.alert_number))}
                  >
                    {resolvingKeys.has(getIssueKey('vulnerability', v.alert_number)) ? 'Resolving...' : 'Mark resolved'}
                  </button>
                </div>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}

  <div class="table-header">
    <h2>Secret Alerts</h2>
  </div>
  {#if (security?.secrets ?? []).length === 0}
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
            <th>Details</th>
            <th>State</th>
            <th>Detected</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {#each security.secrets as s}
            <tr>
              <td>{s.alert_number}</td>
              <td>{s.secret_type || '—'}</td>
              <td class="issue-summary-cell">
                <p class="issue-summary">{s.resolution || 'Open secret alert.'}</p>
                {#if s.url}
                  <a class="issue-source-link" href={s.url} target="_blank" rel="noopener">Open secret alert ↗</a>
                {/if}
              </td>
              <td>{s.state}</td>
              <td class="muted date-cell">{formatDate(s.detected_at)}</td>
              <td>
                <div class="row-actions">
                  <button class="btn-small action-chat" on:click={() => openIssueChat('secret', s)}>Chat</button>
                  <button
                    class="btn-small btn-resolve"
                    on:click={() => markIssueResolved('secret', s.alert_number)}
                    disabled={resolvingKeys.has(getIssueKey('secret', s.alert_number))}
                  >
                    {resolvingKeys.has(getIssueKey('secret', s.alert_number)) ? 'Resolving...' : 'Mark resolved'}
                  </button>
                </div>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}

  {#if issueChatOpen && issueChatTarget}
    <div class="chat-modal-overlay">
      <div class="chat-modal card" role="dialog" aria-modal="true" tabindex="-1">
        <div class="chat-modal-header">
          <h3>Issue chat context</h3>
          <button class="btn-small" on:click={closeIssueChat}>Close</button>
        </div>
        <p class="muted">
          {issueChatTarget.alertType === 'vulnerability' ? 'Dependabot vulnerability' : 'Secret scanning alert'}
          #{issueChatTarget.alert_number}
        </p>
        <textarea
          rows="4"
          bind:value={issueChatPrompt}
          placeholder="What do you want to know about this issue?"
        ></textarea>
        <div class="chat-modal-actions">
          <button class="btn" on:click={submitIssueChat} disabled={issueChatLoading}>
            {issueChatLoading ? 'Thinking...' : 'Ask'}
          </button>
        </div>
        {#if issueChatError}
          <p class="chat-error">{issueChatError}</p>
        {/if}
        {#if issueChatResponse}
          <div class="chat-response-box">
            <p>{issueChatResponse}</p>
          </div>
        {/if}
      </div>
    </div>
  {/if}
{/if}

<style>
  .repo-header {
    position: relative;
    margin-bottom: var(--space-md);
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: var(--space-lg);
  }
  .page-header {
    flex: 1;
    min-width: 0;
  }
  .page-header h1 {
    margin: 0 0 var(--space-xs) 0;
  }
  .page-header p {
    margin: 0;
    font-size: 0.9rem;
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

  .threat-summary-card {
    margin-bottom: var(--space-lg);
  }
  .threat-summary-card h2 {
    margin: 0 0 var(--space-xs) 0;
    font-size: 1.05rem;
  }
  .threat-summary-card p {
    margin: 0;
    font-size: 0.88rem;
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
  .table-wrap { overflow-x: auto; }
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
  .issue-summary-cell {
    max-width: 360px;
  }
  .issue-summary {
    margin: 0;
    font-size: 0.82rem;
    color: var(--text-secondary);
    line-height: 1.35;
  }
  .issue-source-link {
    display: inline-block;
    margin-top: 0.25rem;
    font-size: 0.78rem;
    text-decoration: none;
    color: var(--accent);
  }
  .issue-source-link:hover {
    text-decoration: underline;
  }
  .row-actions {
    display: flex;
    flex-direction: column;
    gap: 0.45rem;
    align-items: stretch;
    min-width: 8rem;
  }
  .row-actions .btn-small {
    border: 1px solid var(--border);
    background: var(--bg);
    color: var(--text-secondary);
    border-radius: 0.6rem;
    font-size: 0.77rem;
    font-weight: 600;
    line-height: 1.2;
    padding: 0.42rem 0.72rem;
    width: 100%;
    text-align: center;
    cursor: pointer;
    transition: all var(--transition);
  }
  .row-actions .btn-small:hover {
    border-color: color-mix(in srgb, var(--accent) 35%, var(--border));
    background: var(--bg-elevated);
    color: var(--text);
    transform: translateY(-1px);
  }
  .row-actions .btn-small:active {
    transform: translateY(0);
  }
  .row-actions .btn-small:disabled {
    opacity: 0.65;
    cursor: not-allowed;
    transform: none;
  }
  .action-chat {
    border-color: color-mix(in srgb, var(--accent) 20%, var(--border));
    color: color-mix(in srgb, var(--accent) 85%, var(--text) 15%);
  }
  .btn-resolve {
    color: #16a34a;
    border-color: rgba(22, 163, 74, 0.35);
    background: rgba(22, 163, 74, 0.08);
  }
  .btn-resolve:hover {
    border-color: rgba(22, 163, 74, 0.55);
    color: #15803d;
    background: rgba(22, 163, 74, 0.14);
  }
  tr:last-child td { border-bottom: none; }
  tr:hover td { background: var(--bg-hover, rgba(255,255,255,0.03)); }

  .sev-pill {
    display: inline-block;
    padding: 0.15rem 0.55rem;
    border-radius: 999px;
    font-size: 0.75rem;
    font-weight: 600;
  }
  .sev-critical { color: #ef4444; background: rgba(239, 68, 68, 0.12); }
  .sev-high     { color: #f97316; background: rgba(249, 115, 22, 0.12); }
  .sev-medium   { color: #ca8a04; background: rgba(234, 179, 8, 0.12); }
  .sev-low      { color: var(--text-secondary); background: rgba(100, 116, 139, 0.12); }

  .date-cell {
    font-size: 0.8rem;
    white-space: nowrap;
  }
  .empty-state {
    padding: var(--space-2xl);
    text-align: center;
    color: var(--text-muted);
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
  .chat-modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.45);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--space-lg);
    z-index: 30;
  }
  .chat-modal {
    width: min(760px, 96vw);
    max-height: 85vh;
    overflow: auto;
  }
  .chat-modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: var(--space-sm);
    margin-bottom: var(--space-sm);
  }
  .chat-modal-header h3 {
    margin: 0;
  }
  .chat-modal textarea {
    width: 100%;
    margin: var(--space-sm) 0;
  }
  .chat-modal-actions {
    display: flex;
    justify-content: flex-end;
  }
  .chat-error {
    color: var(--error);
    margin: var(--space-sm) 0 0 0;
    font-size: 0.85rem;
  }
  .chat-response-box {
    margin-top: var(--space-sm);
    border-top: 1px solid var(--border);
    padding-top: var(--space-sm);
    font-size: 0.9rem;
    line-height: 1.5;
  }
  @media (max-width: 900px) {
    .repo-header {
      gap: var(--space-sm);
      flex-wrap: wrap;
    }
    .back-link {
      position: static;
      order: -1;
    }
  }
</style>
