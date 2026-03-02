import { Client } from '@upstash/qstash';
import { RECONCILE_CRON_SECRET, QSTASH_TOKEN } from '$env/static/private';
import { PUBLIC_BASE_URL } from '$env/static/public';

let client: Client | null = null;

export function getQStash(): Client {
  const token = QSTASH_TOKEN;
  if (!token) throw new Error('QSTASH_TOKEN is not set');
  if (!client) client = new Client({ token });
  return client;
}

function getBaseUrl(): string {
  return (PUBLIC_BASE_URL || 'http://localhost:5173').replace(/\/$/, '');
}

function getWorkerHeaders(): Record<string, string> {
  const secret = process.env.WORKER_AUTH_SECRET || RECONCILE_CRON_SECRET;
  return secret ? { Authorization: `Bearer ${secret}` } : {};
}

export async function enqueueSyncRepo(repoId: string, fullName: string) {
  const qstash = getQStash();
  await qstash.publishJSON({
    url: `${getBaseUrl()}/api/workers/sync-repo`,
    body: { repoId, fullName },
    headers: getWorkerHeaders(),
    retries: 2
  });
}

export async function enqueueEmbedRepo(repoId: string) {
  const qstash = getQStash();
  await qstash.publishJSON({
    url: `${getBaseUrl()}/api/workers/embed-repo`,
    body: { repoId },
    headers: getWorkerHeaders(),
    retries: 2
  });
}

export async function enqueueSummarizeRepo(repoId: string) {
  const qstash = getQStash();
  await qstash.publishJSON({
    url: `${getBaseUrl()}/api/workers/summarize-repo`,
    body: { repoId },
    headers: getWorkerHeaders(),
    retries: 2
  });
}

export async function enqueueScanRepo(repoId: string, fullName: string) {
  const qstash = getQStash();
  await qstash.publishJSON({
    url: `${getBaseUrl()}/api/workers/scan-repo`,
    body: { repoId, fullName },
    headers: getWorkerHeaders(),
    retries: 2
  });
}
