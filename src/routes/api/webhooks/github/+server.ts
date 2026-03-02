import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { verifyWebhookSignature } from '$lib/github';
import { getDb } from '$lib/db/client';
import { enqueueSyncRepo } from '$lib/qstash';

export const POST: RequestHandler = async ({ request }) => {
  const payload = await request.text();
  const signature = request.headers.get('x-hub-signature-256') || '';

  if (!verifyWebhookSignature(payload, signature)) {
    return json({ error: 'Invalid signature' }, { status: 401 });
  }

  let body: {
    action?: string;
    repository?: { id: number; full_name: string; name: string };
    installation?: { id: number; account?: { id: number; login: string } };
    account?: { id: number; login: string };
    repositories_added?: { id: number; full_name: string; name: string }[];
    repositories_removed?: { id: number; full_name: string; name: string }[];
  };
  try {
    body = JSON.parse(payload);
  } catch {
    return json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const event = request.headers.get('x-github-event');
  const repo = body.repository;
  const db = getDb();

  if (event === 'installation') {
    const inst = body.installation;
    const account = inst?.account ?? body.account;
    if (body.action === 'deleted' && inst?.id) {
      await db`
        UPDATE organizations
        SET install_id = NULL, updated_at = NOW()
        WHERE install_id = ${inst.id}
      `;
      return json({ received: true, uninstalled: true });
    }
    if (inst?.id && account) {
      await db`
        INSERT INTO organizations (github_id, name, install_id)
        VALUES (${account.id}, ${account.login}, ${inst.id})
        ON CONFLICT (github_id) DO UPDATE SET install_id = EXCLUDED.install_id, updated_at = NOW()
      `;
    }
    return json({ received: true });
  }

  if (event === 'installation_repositories') {
    const inst = body.installation;
    const account = inst?.account ?? body.account;
    if (!inst?.id || !account) return json({ received: true });

    await db`
      INSERT INTO organizations (github_id, name, install_id)
      VALUES (${account.id}, ${account.login}, ${inst.id})
      ON CONFLICT (github_id) DO UPDATE SET install_id = EXCLUDED.install_id, updated_at = NOW()
    `;

    const [org] = await db`
      SELECT id FROM organizations WHERE install_id = ${inst.id} LIMIT 1
    `;
    if (!org) return json({ received: true });

    const added = body.repositories_added || [];
    for (const r of added) {
      const [existing] = await db`
        SELECT id FROM repositories WHERE org_id = ${org.id} AND github_id = ${r.id} LIMIT 1
      `;
      if (!existing) {
        const [inserted] = await db`
          INSERT INTO repositories (org_id, github_id, name, full_name, url, default_branch)
          VALUES (
            ${org.id},
            ${r.id},
            ${r.name || r.full_name?.split('/')[1] || 'unknown'},
            ${r.full_name},
            ${`https://github.com/${r.full_name}`},
            'main'
          )
          RETURNING id
        `;
        if (inserted) {
          try {
            await enqueueSyncRepo(inserted.id, r.full_name);
          } catch (queueError) {
            console.error('Webhook: failed to enqueue repo sync', r.full_name, queueError);
          }
        }
      }
    }

    const removed = body.repositories_removed || [];
    for (const r of removed) {
      await db`DELETE FROM repositories WHERE org_id = ${org.id} AND github_id = ${r.id}`;
    }

    return json({ received: true, added: added.length, removed: removed.length });
  }

  if (!repo) return json({ received: true });

  const [org] = await db`
    SELECT id FROM organizations WHERE install_id = ${body.installation?.id}
    LIMIT 1
  `;

  if (!org) return json({ received: true, skipped: 'org not found' });

  const [existing] = await db`
    SELECT id FROM repositories WHERE org_id = ${org.id} AND github_id = ${repo.id}
    LIMIT 1
  `;

  let repoId: string;
  if (existing) {
    repoId = existing.id;
  } else {
    const inserted = await db`
      INSERT INTO repositories (org_id, github_id, name, full_name, url, default_branch)
      VALUES (
        ${org.id},
        ${repo.id},
        ${repo.name || repo.full_name.split('/')[1]},
        ${repo.full_name},
        ${`https://github.com/${repo.full_name}`},
        'main'
      )
      RETURNING id
    `;
    repoId = inserted[0]?.id;
  }

  if (event === 'repository' && body.action === 'deleted') {
    await db`DELETE FROM repositories WHERE id = ${repoId}`;
    return json({ received: true, deleted: true });
  }

  const [r] = await db`SELECT id FROM repositories WHERE github_id = ${repo.id} LIMIT 1`;
  if (r) {
    try {
      await enqueueSyncRepo(r.id, repo.full_name);
    } catch (queueError) {
      console.error('Webhook: failed to enqueue repo sync', repo.full_name, queueError);
    }
  }

  return json({ received: true });
};
