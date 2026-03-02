import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/db/client';
import { getInstallationToken } from '$lib/github';
import { enqueueSyncRepo } from '$lib/qstash';
import { isBearerAuthorized } from '$lib/auth';
import { RECONCILE_CRON_SECRET } from '$env/static/private';

export const POST: RequestHandler = async ({ request }) => {
  let body: { mode?: 'all' | 'stale'; staleAfterHours?: number } = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const mode = body.mode === 'all' ? 'all' : 'stale';
  const staleAfterHours =
    typeof body.staleAfterHours === 'number' && Number.isFinite(body.staleAfterHours) && body.staleAfterHours > 0
      ? Math.floor(body.staleAfterHours)
      : 24;
  const staleCutoff = new Date(Date.now() - staleAfterHours * 60 * 60 * 1000);

  const workerSecret = process.env.WORKER_AUTH_SECRET || RECONCILE_CRON_SECRET;
  if (!isBearerAuthorized(request, workerSecret)) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = getDb();
  const orgs = await db`SELECT id, install_id, name FROM organizations WHERE install_id IS NOT NULL`;
  let totalRepos = 0;
  let queued = 0;
  let skipped = 0;

  for (const org of orgs) {
    try {
      const installToken = await getInstallationToken(org.install_id);
      const headers = {
        Authorization: `Bearer ${installToken}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28'
      };

      // Use installation/repositories endpoint — works for both User and Org accounts
      let repos: any[] = [];
      let page = 1;
      while (true) {
        const res = await fetch(
          `https://api.github.com/installation/repositories?per_page=100&page=${page}`,
          { headers }
        );
        if (!res.ok) {
          console.error('Reconcile: failed to fetch installation repos', await res.text());
          break;
        }
        const data = await res.json();
        repos = repos.concat(data.repositories || []);
        if (repos.length >= data.total_count) break;
        page++;
      }

      console.log(`Reconcile: found ${repos.length} repos for ${org.name}`);
      totalRepos += repos.length;

      for (const r of repos) {
        const [existing] = await db`
          SELECT id, updated_at FROM repositories WHERE org_id = ${org.id} AND github_id = ${r.id} LIMIT 1
        `;
        let repoId = existing?.id as string | undefined;
        const lastSyncedAt = existing?.updated_at ? new Date(existing.updated_at as string) : null;

        if (!repoId) {
          const [inserted] = await db`
            INSERT INTO repositories (org_id, github_id, name, full_name, url, default_branch)
            VALUES (${org.id}, ${r.id}, ${r.name}, ${r.full_name}, ${r.html_url}, ${r.default_branch || 'main'})
            RETURNING id
          `;
          repoId = inserted?.id;
        }

        const shouldEnqueue = mode === 'all' || !lastSyncedAt || lastSyncedAt <= staleCutoff;

        if (repoId && shouldEnqueue) {
          try {
            await enqueueSyncRepo(repoId, r.full_name);
            queued += 1;
          } catch (queueError) {
            // Keep processing all repos even if async worker enqueue fails for one repo.
            console.error('Reconcile: enqueue sync failed for repo', r.full_name, queueError);
          }
        } else if (repoId) {
          skipped += 1;
        }
      }
    } catch (e) {
      console.error('Reconcile failed for org', org.name, e);
    }
  }

  return json({
    ok: true,
    mode,
    staleAfterHours: mode === 'stale' ? staleAfterHours : null,
    totalRepos,
    queued,
    skipped
  });
};
