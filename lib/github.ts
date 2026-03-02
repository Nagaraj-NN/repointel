import {
  GITHUB_APP_ID,
  GITHUB_APP_PRIVATE_KEY,
  GITHUB_WEBHOOK_SECRET
} from '$env/static/private';
import crypto from 'crypto';

const GITHUB_API = 'https://api.github.com';

export function verifyWebhookSignature(payload: string, signature: string): boolean {
  const secret = GITHUB_WEBHOOK_SECRET;
  if (!secret) return false;
  const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(payload).digest('hex');
  const sigBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (sigBuffer.length !== expectedBuffer.length) return false;
  return crypto.timingSafeEqual(sigBuffer, expectedBuffer);
}

export async function getInstallationToken(installationId: number): Promise<string> {
  const appId = GITHUB_APP_ID;
  const privateKey = GITHUB_APP_PRIVATE_KEY?.replace(/\\n/g, '\n');
  if (!appId || !privateKey) throw new Error('GitHub App credentials not configured');

  const now = Math.floor(Date.now() / 1000);
  const payload = { iat: now, exp: now + 600, iss: appId };
  const token = await createJwt(privateKey, payload);

  const res = await fetch(
    `https://api.github.com/app/installations/${installationId}/access_tokens`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28'
      }
    }
  );
  if (!res.ok) throw new Error(`Failed to get installation token: ${await res.text()}`);
  const data = await res.json();
  return data.token;
}

async function createJwt(privateKey: string, payload: object): Promise<string> {
  const header = { alg: 'RS256', typ: 'JWT' };
  const base64 = (obj: object) =>
    Buffer.from(JSON.stringify(obj)).toString('base64url');
  const signatureInput = `${base64(header)}.${base64(payload)}`;
  const sign = crypto.createSign('RSA-SHA256');
  sign.update(signatureInput);
  const sig = sign.sign(privateKey, 'base64url');
  return `${signatureInput}.${sig}`;
}

export async function fetchRepoData(
  token: string,
  owner: string,
  repo: string,
  defaultBranch: string = 'main'
) {
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28'
  };

  const [repoRes, languagesRes, commitsRes] = await Promise.all([
    fetch(`${GITHUB_API}/repos/${owner}/${repo}`, { headers }),
    fetch(`${GITHUB_API}/repos/${owner}/${repo}/languages`, { headers }),
    fetch(`${GITHUB_API}/repos/${owner}/${repo}/commits?per_page=1`, { headers })
  ]);

  if (!repoRes.ok) throw new Error(`Repo fetch failed: ${repoRes.status}`);

  const repoData = await repoRes.json();
  const languages = languagesRes.ok ? await languagesRes.json() : {};
  const commits = commitsRes.ok ? await commitsRes.json() : [];
  const lastCommit = commits[0]?.commit?.author?.date ?? null;

  const readmeRes = await fetch(
    `${GITHUB_API}/repos/${owner}/${repo}/readme`,
    { headers }
  );
  let readmeContent = null;
  if (readmeRes.ok) {
    const readmeData = await readmeRes.json();
    readmeContent = Buffer.from(readmeData.content, 'base64').toString('utf-8');
  }

  const codeownersRes = await fetch(
    `${GITHUB_API}/repos/${owner}/${repo}/contents/CODEOWNERS`,
    { headers }
  );
  let codeownersContent = null;
  if (codeownersRes.ok) {
    const coData = await codeownersRes.json();
    codeownersContent = Buffer.from(coData.content, 'base64').toString('utf-8');
  }

  const docsRes = await fetch(
    `${GITHUB_API}/repos/${owner}/${repo}/contents/docs`,
    { headers }
  );
  const docsFiles: { path: string; content: string }[] = [];
  if (docsRes.ok) {
    const docsData = await docsRes.json();
    if (Array.isArray(docsData)) {
      for (const file of docsData) {
        if (file.type === 'file' && file.name.endsWith('.md')) {
          const fileUrl = file.download_url || `${GITHUB_API}/repos/${owner}/${repo}/contents/${file.path}`;
          const fileRes = await fetch(fileUrl, { headers: { ...headers, Accept: 'application/vnd.github.raw' } });
          if (fileRes.ok) {
            docsFiles.push({ path: file.path, content: await fileRes.text() });
          }
        }
      }
    }
  }

  // Topics fallback for personal repos where org custom properties may be unavailable.
  let topics: string[] = [];
  const topicsRes = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/topics`, {
    headers: { ...headers, Accept: 'application/vnd.github+json' }
  });
  if (topicsRes.ok) {
    const topicsData = await topicsRes.json();
    if (Array.isArray(topicsData?.names)) {
      topics = topicsData.names
        .map((t: unknown) => String(t).trim())
        .filter((t: string) => t.length > 0);
    }
  }

  // GitHub custom properties (if configured on org/repo).
  // Endpoint may return 404/403 depending on permissions or availability.
  let customProperties: Record<string, string> = {};
  const propsRes = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/properties/values`, { headers });
  if (propsRes.ok) {
    const propsData = await propsRes.json();
    if (Array.isArray(propsData)) {
      customProperties = Object.fromEntries(
        propsData
          .filter((p) => p && typeof p.property_name === 'string')
          .map((p) => [p.property_name, String(p.value ?? '')])
          .filter(([, value]) => value.trim().length > 0)
      );
    }
  }

  if (!customProperties.domain && topics.length > 0) {
    customProperties.domain = topics.join(',');
  }

  return {
    repo: {
      github_id: repoData.id,
      name: repoData.name,
      full_name: repoData.full_name,
      url: repoData.html_url,
      default_branch: repoData.default_branch || defaultBranch,
      archived: repoData.archived || false,
      description: repoData.description
    },
    metadata: {
      description: repoData.description,
      language_stats: languages,
      last_commit_at: lastCommit,
      star_count: repoData.stargazers_count || 0,
      fork_count: repoData.forks_count || 0
    },
    readme: readmeContent,
    codeowners: codeownersContent,
    docs: docsFiles,
    custom_properties: customProperties,
    owner: owner
  };
}

export interface DependabotAlert {
  alert_number: number;
  cve_id: string | null;
  package_name: string | null;
  severity: string;
  state: string;
  summary: string | null;
  url: string | null;
  detected_at: string | null;
  resolved_at: string | null;
}

export interface SecretScanningAlert {
  alert_number: number;
  secret_type: string | null;
  state: string;
  resolution: string | null;
  url: string | null;
  detected_at: string | null;
}

export async function fetchDependabotAlerts(
  token: string,
  owner: string,
  repo: string
): Promise<DependabotAlert[]> {
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28'
  };

  const res = await fetch(
    `${GITHUB_API}/repos/${owner}/${repo}/dependabot/alerts?state=open&per_page=100`,
    { headers }
  );

  if (!res.ok) {
    // 404 = GAS not enabled or no Dependabot alerts configured; treat as empty
    if (res.status === 404 || res.status === 403) return [];
    throw new Error(`Dependabot alerts fetch failed: ${res.status}`);
  }

  const data = await res.json();
  if (!Array.isArray(data)) return [];

  return data.map((alert: Record<string, unknown>) => ({
    alert_number: alert.number as number,
    cve_id: (alert.security_advisory as Record<string, unknown> | null)?.cve_id as string | null ?? null,
    package_name: ((alert.dependency as Record<string, unknown> | null)?.package as Record<string, unknown> | null)?.name as string | null ?? null,
    severity: ((alert.security_advisory as Record<string, unknown> | null)?.severity as string) ?? 'unknown',
    state: alert.state as string,
    summary: (alert.security_advisory as Record<string, unknown> | null)?.summary as string | null ?? null,
    url: alert.html_url as string | null ?? null,
    detected_at: alert.created_at as string | null ?? null,
    resolved_at: alert.auto_dismissed_at as string | null ?? null
  }));
}

export async function fetchSecretScanningAlerts(
  token: string,
  owner: string,
  repo: string
): Promise<SecretScanningAlert[]> {
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28'
  };

  const res = await fetch(
    `${GITHUB_API}/repos/${owner}/${repo}/secret-scanning/alerts?state=open&per_page=100`,
    { headers }
  );

  if (!res.ok) {
    if (res.status === 404 || res.status === 403) return [];
    throw new Error(`Secret scanning alerts fetch failed: ${res.status}`);
  }

  const data = await res.json();
  if (!Array.isArray(data)) return [];

  return data.map((alert: Record<string, unknown>) => ({
    alert_number: alert.number as number,
    secret_type: alert.secret_type as string | null ?? null,
    state: alert.state as string,
    resolution: alert.resolution as string | null ?? null,
    url: alert.html_url as string | null ?? null,
    detected_at: alert.created_at as string | null ?? null
  }));
}
