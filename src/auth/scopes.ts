export const MCP_SCOPES = [
  "analytics.readonly",
  "webmasters.readonly",
] as const;

export type McpScope = (typeof MCP_SCOPES)[number];

export const SCOPE_COPY: Record<McpScope, string> = {
  "analytics.readonly":
    "Read Google Analytics 4 accounts, properties, and reports",
  "webmasters.readonly":
    "Read Search Console sites, performance, sitemaps, and URL inspection",
};

export const GOOGLE_OAUTH_SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/analytics.readonly",
  "https://www.googleapis.com/auth/webmasters.readonly",
] as const;

export const GOOGLE_SCOPE_STRING = GOOGLE_OAUTH_SCOPES.join(" ");

export function isMcpScope(value: string): value is McpScope {
  return (MCP_SCOPES as readonly string[]).includes(value);
}
