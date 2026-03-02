export function getBearerToken(request: Request): string | null {
  const authHeader = request.headers.get('authorization');
  return authHeader?.replace(/^Bearer\s+/i, '').trim() || null;
}

export function isBearerAuthorized(request: Request, secret: string | undefined | null): boolean {
  if (!secret) return false;
  const token = getBearerToken(request);
  return token === secret;
}

export function isOptionalApiAuthorized(
  request: Request,
  secret: string | undefined | null
): boolean {
  // Enforce auth only when a secret is configured.
  if (!secret) return true;
  return isBearerAuthorized(request, secret);
}

export function isSameOriginRequest(request: Request, url: URL): boolean {
  const origin = request.headers.get('origin');
  if (origin && origin === url.origin) return true;

  const referer = request.headers.get('referer');
  if (referer && referer.startsWith(url.origin)) return true;

  const fetchSite = (request.headers.get('sec-fetch-site') || '').toLowerCase();
  return fetchSite === 'same-origin' || fetchSite === 'none';
}

export function isReadApiAuthorized(
  request: Request,
  url: URL,
  secret: string | undefined | null
): boolean {
  // Explicit bearer token access (scripts, automations, integrations).
  if (secret && isBearerAuthorized(request, secret)) return true;

  // Browser traffic from the same host remains allowed.
  if (isSameOriginRequest(request, url)) return true;

  // Tighten in production by default, while keeping local DX simple.
  return process.env.NODE_ENV !== 'production';
}
