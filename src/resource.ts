export function resolveResource(
  request: Request,
  configured: string,
): { resource: string; issuer: string } {
  const requestUrl = new URL(request.url);
  const raw = configured.trim();
  if (raw) {
    const parsed = new URL(raw);
    const path = parsed.pathname.replace(/\/$/, "") || "/mcp";
    return {
      resource: `${parsed.origin}${path}${parsed.search}`,
      issuer: parsed.origin,
    };
  }
  return { resource: `${requestUrl.origin}/mcp`, issuer: requestUrl.origin };
}
