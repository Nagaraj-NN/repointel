import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/db/client';
import { chat } from '$lib/ai/llm';
import { isBearerAuthorized } from '$lib/auth';
import { RECONCILE_CRON_SECRET } from '$env/static/private';
import {
  detectTechStack,
  detectEntryPoints,
  detectArchitectureStyle,
  calculateHealthScore
} from '$lib/intelligence';
import { enqueueScanRepo } from '$lib/qstash';

export const POST: RequestHandler = async ({ request }) => {
  const workerSecret = process.env.WORKER_AUTH_SECRET || RECONCILE_CRON_SECRET;
  if (!isBearerAuthorized(request, workerSecret)) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { repoId?: string };
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { repoId } = body;
  if (!repoId) return json({ error: 'repoId required' }, { status: 400 });

  const db = getDb();

  const [repo] = await db`
    SELECT r.id, r.full_name, r.default_branch, rm.last_commit_at
    FROM repositories r
    LEFT JOIN repo_metadata rm ON rm.repo_id = r.id
    WHERE r.id = ${repoId}
    LIMIT 1
  `;
  if (!repo) return json({ error: 'Repo not found' }, { status: 404 });

  const files = (await db`
    SELECT id, path, content, file_type FROM repo_files WHERE repo_id = ${repoId}
  `) as { id: string; path: string; content: string | null; file_type: string | null }[];

  const docs = await db`
    SELECT doc_type, content FROM repo_docs WHERE repo_id = ${repoId}
  `;

  const techStack = detectTechStack(files);
  const entryPoints = detectEntryPoints(files);
  const archStyle = detectArchitectureStyle(files);

  const hasReadme = docs.some((d) => d.doc_type === 'README');
  const hasCodeowners = files.some((f) => f.path === 'CODEOWNERS');
  const hasArchDoc = docs.some((d) => d.doc_type === 'architecture');

  let lastActiveDays: number | null = null;
  if (repo.last_commit_at) {
    lastActiveDays = Math.floor(
      (Date.now() - new Date(repo.last_commit_at).getTime()) / (1000 * 60 * 60 * 24)
    );
  }

  const healthScore = calculateHealthScore(hasReadme, hasCodeowners, hasArchDoc, lastActiveDays);

  const combinedContent = docs.map((d) => `${d.doc_type}:\n${d.content}`).join('\n\n');
  let problemSummary = '';
  let archSummary = '';

  if (combinedContent.length > 100) {
    try {
      problemSummary = await chat(
        [
          {
            role: 'user',
            content: `Based on this repo documentation, what problem does this repository solve? Max 3 sentences.\n\n${combinedContent.slice(0, 4000)}`
          }
        ],
        'You are a technical writer. Be concise.'
      );
      archSummary = await chat(
        [
          {
            role: 'user',
            content: `Describe the architecture of this codebase in plain English. Tech stack: ${techStack.join(', ')}. Style: ${archStyle}.\n\n${combinedContent.slice(0, 4000)}`
          }
        ],
        'You are a software architect. Be concise.'
      );
    } catch (e) {
      console.error('AI summary failed:', e);
    }
  }

  await db`
    INSERT INTO repo_summaries (repo_id, ai_summary, arch_summary, problem_summary, tech_stack_detected)
    VALUES (${repoId}, ${(problemSummary + ' ' + archSummary).trim() || null}, ${archSummary || null}, ${problemSummary || null}, ${JSON.stringify(techStack)})
    ON CONFLICT (repo_id) DO UPDATE SET
      ai_summary = EXCLUDED.ai_summary,
      arch_summary = EXCLUDED.arch_summary,
      problem_summary = EXCLUDED.problem_summary,
      tech_stack_detected = EXCLUDED.tech_stack_detected,
      generated_at = NOW()
  `;

  await db`
    INSERT INTO repo_health_scores (repo_id, has_readme, has_codeowners, has_arch_doc, last_active_days, health_score)
    VALUES (${repoId}, ${hasReadme}, ${hasCodeowners}, ${hasArchDoc}, ${lastActiveDays}, ${healthScore})
    ON CONFLICT (repo_id) DO UPDATE SET
      has_readme = EXCLUDED.has_readme,
      has_codeowners = EXCLUDED.has_codeowners,
      has_arch_doc = EXCLUDED.has_arch_doc,
      last_active_days = EXCLUDED.last_active_days,
      health_score = EXCLUDED.health_score,
      updated_at = NOW()
  `;

  await db`DELETE FROM audit_flags WHERE repo_id = ${repoId}`;

  const flags: { flag_type: string; severity: string }[] = [];
  if (!hasReadme) flags.push({ flag_type: 'missing_readme', severity: 'medium' });
  if (!hasCodeowners) flags.push({ flag_type: 'no_codeowners', severity: 'low' });
  if (!hasArchDoc) flags.push({ flag_type: 'no_arch_doc', severity: 'low' });
  if (lastActiveDays !== null && lastActiveDays > 180) flags.push({ flag_type: 'inactive', severity: 'medium' });

  for (const f of flags) {
    await db`
      INSERT INTO audit_flags (repo_id, flag_type, severity, details)
      VALUES (${repoId}, ${f.flag_type}, ${f.severity}, ${f.flag_type})
    `;
  }

  try {
    await enqueueScanRepo(repoId, repo.full_name);
  } catch (queueError) {
    console.error('Summarize worker: enqueue scan failed for repo', repo.full_name, queueError);
  }

  return json({ ok: true, repoId });
};
