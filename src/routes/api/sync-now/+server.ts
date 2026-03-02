import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { isReadApiAuthorized } from '$lib/auth';
import { env } from '$env/dynamic/private';

export const POST: RequestHandler = async ({ request, url, fetch }) => {
  const apiSecret = process.env.API_AUTH_SECRET;
  if (!isReadApiAuthorized(request, url, apiSecret)) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  const workerSecret = process.env.WORKER_AUTH_SECRET || env.RECONCILE_CRON_SECRET;
  if (!workerSecret) {
    return json({ error: 'Worker auth secret is not configured' }, { status: 500 });
  }

  let body: { repoId?: string; fullName?: string; mode?: 'all' | 'stale'; staleAfterHours?: number } = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const syncSingleRepo = Boolean(body.repoId && body.fullName);
  const targetUrl = syncSingleRepo
    ? `${url.origin}/api/workers/sync-repo`
    : `${url.origin}/api/workers/reconcile`;

  const targetRes = await fetch(targetUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${workerSecret}`,
      'Content-Type': 'application/json'
    },
    body: syncSingleRepo
      ? JSON.stringify({ repoId: body.repoId, fullName: body.fullName })
      : JSON.stringify({
          mode: body.mode === 'stale' ? 'stale' : 'all',
          staleAfterHours:
            typeof body.staleAfterHours === 'number' && Number.isFinite(body.staleAfterHours)
              ? body.staleAfterHours
              : undefined
        })
  });

  let payload: Record<string, unknown> = {};
  try {
    payload = await targetRes.json();
  } catch {
    payload = {};
  }

  if (!targetRes.ok) {
    const fallbackError = syncSingleRepo
      ? `Repository ${body.fullName} failed to sync.`
      : 'Failed to trigger repository sync';
    return json(
      {
        error: (payload.error as string) || fallbackError
      },
      { status: targetRes.status }
    );
  }

  return json({
    ok: true,
    message: syncSingleRepo
      ? `Repository ${body.fullName} sync completed successfully.`
      : 'Sync for all repositories triggered successfully'
  });
};
