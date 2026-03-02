<script lang="ts">
  import { onMount, tick } from 'svelte';

  type Citation = { repo?: string; path?: string; url: string };
  type ChatMessage = {
    role: 'user' | 'assistant';
    content: string;
    citations?: Citation[];
  };

  const STORAGE_KEY = 'repointel-org-chat-history-v1';

  let message = '';
  let loading = false;
  let messages: ChatMessage[] = [];
  let chatContainer: HTMLDivElement | null = null;

  onMount(async () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          messages = parsed.filter(
            (m) =>
              (m.role === 'user' || m.role === 'assistant') &&
              typeof m.content === 'string'
          );
        }
      }
    } catch {
      // Ignore storage parse errors and start fresh.
    }
    await scrollToBottom();
  });

  function persist() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
  }

  async function scrollToBottom() {
    await tick();
    chatContainer?.scrollTo({ top: chatContainer.scrollHeight, behavior: 'smooth' });
  }

  async function send() {
    const prompt = message.trim();
    if (!prompt || loading) return;

    const userMessage: ChatMessage = { role: 'user', content: prompt };
    messages = [...messages, userMessage];
    message = '';
    loading = true;
    persist();
    await scrollToBottom();

    try {
      const r = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: prompt })
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Request failed');

      messages = [
        ...messages,
        {
          role: 'assistant',
          content: data.answer || 'No answer.',
          citations: Array.isArray(data.citations) ? data.citations : []
        }
      ];
    } catch (e) {
      messages = [
        ...messages,
        {
          role: 'assistant',
          content: `Error: ${(e as Error).message}`
        }
      ];
    } finally {
      loading = false;
      persist();
      await scrollToBottom();
    }
  }

  function onInputKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      send();
    }
  }

  async function clearChat() {
    messages = [];
    localStorage.removeItem(STORAGE_KEY);
    await scrollToBottom();
  }
</script>

<section class="page-header">
  <h1>Org Chat</h1>
  <p class="muted">Ask questions across all repositories. Answers are grounded in indexed content.</p>
</section>

<div class="card chat-shell">
  <div class="chat-toolbar">
    <span class="muted">{messages.length} messages</span>
    <button class="btn btn-outline" on:click={clearChat} disabled={loading || messages.length === 0}>
      Clear chat
    </button>
  </div>

  <div class="chat-history" bind:this={chatContainer}>
    {#if messages.length === 0}
      <p class="empty-state muted">Start the conversation: “What does our repointel repo do?”</p>
    {/if}

    {#each messages as m}
      <div class="msg-row {m.role === 'user' ? 'user' : 'assistant'}">
        <div class="msg-bubble">
          <div class="msg-role">{m.role === 'user' ? 'You' : 'RepoIntel'}</div>
          <div class="msg-content">{m.content}</div>
          {#if m.citations?.length}
            <div class="msg-citations">
              <span class="muted">Sources:</span>
              <ul>
                {#each m.citations as c}
                  <li><a href={c.url} target="_blank" rel="noopener">{c.repo || c.path || c.url}</a></li>
                {/each}
              </ul>
            </div>
          {/if}
        </div>
      </div>
    {/each}
    {#if loading}
      <div class="msg-row assistant">
        <div class="msg-bubble">
          <div class="msg-role">RepoIntel</div>
          <div class="msg-content muted">Thinking...</div>
        </div>
      </div>
    {/if}
  </div>

  <div class="chat-input">
    <textarea
      bind:value={message}
      on:keydown={onInputKeydown}
      placeholder="Ask anything about your repos (Shift+Enter for newline)"
      rows="3"
      disabled={loading}
    ></textarea>
    <button class="btn" on:click={send} disabled={loading || !message.trim()}>
      Send
    </button>
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

  .chat-shell {
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
  }
  .chat-toolbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .chat-history {
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    background: var(--bg-muted);
    height: min(62vh, 640px);
    overflow-y: auto;
    padding: var(--space-md);
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
  }
  .empty-state {
    margin: auto;
    text-align: center;
  }
  .msg-row {
    display: flex;
  }
  .msg-row.user {
    justify-content: flex-end;
  }
  .msg-row.assistant {
    justify-content: flex-start;
  }
  .msg-bubble {
    max-width: min(90%, 900px);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    background: var(--bg-elevated);
    padding: var(--space-sm) var(--space-md);
  }
  .msg-row.user .msg-bubble {
    background: var(--accent-muted);
    border-color: color-mix(in oklab, var(--accent) 30%, var(--border));
  }
  .msg-role {
    font-size: 0.75rem;
    color: var(--text-muted);
    margin-bottom: var(--space-xs);
  }
  .msg-content {
    white-space: pre-wrap;
    line-height: 1.6;
  }
  .msg-citations {
    margin-top: var(--space-sm);
    font-size: 0.8125rem;
  }
  .msg-citations ul {
    margin: var(--space-xs) 0 0 0;
    padding-left: 1.1rem;
  }
  .chat-input {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
  }
  .chat-input textarea {
    width: 100%;
    min-height: 96px;
  }
</style>
