import type { GoogleProps } from "../auth/props";
import { GOOGLE_SCOPE_STRING } from "../auth/scopes";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo";
const REFRESH_SKEW_MS = 60_000;

export type GoogleOAuthErrorCode =
  | "invalid_grant"
  | "temporarily_unavailable"
  | "missing_refresh_token"
  | "token_exchange_failed";

export class GoogleOAuthError extends Error {
  readonly code: GoogleOAuthErrorCode;

  constructor(message: string, code: GoogleOAuthErrorCode) {
    super(message);
    this.name = "GoogleOAuthError";
    this.code = code;
  }
}

export type TokenSecrets = {
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
};

type TokenResponse = {
  access_token?: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
  error?: string;
  error_description?: string;
};

export function buildGoogleAuthorizeUrl(input: {
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
  hostedDomain?: string;
}): string {
  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set("client_id", input.clientId);
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", GOOGLE_SCOPE_STRING);
  url.searchParams.set("state", input.state);
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("code_challenge", input.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  const domain = input.hostedDomain?.trim();
  if (domain) url.searchParams.set("hd", domain);
  return url.href;
}

export async function createPkcePair(): Promise<{
  verifier: string;
  challenge: string;
}> {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const verifier = base64Url(bytes);
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(verifier),
  );
  return { verifier, challenge: base64Url(new Uint8Array(digest)) };
}

export async function exchangeAuthorizationCode(input: {
  clientId: string;
  clientSecret: string;
  code: string;
  redirectUri: string;
  codeVerifier: string;
  fetcher?: typeof fetch;
  now?: number;
}): Promise<{
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  scope: string;
}> {
  const body = await postToken(
    {
      client_id: input.clientId,
      client_secret: input.clientSecret,
      code: input.code,
      code_verifier: input.codeVerifier,
      grant_type: "authorization_code",
      redirect_uri: input.redirectUri,
    },
    input.fetcher ?? fetch,
  );
  if (!body.refresh_token) {
    throw new GoogleOAuthError(
      "Google did not return a refresh token. Disconnect this app at https://myaccount.google.com/permissions and sign in again. Also set the OAuth consent screen publishing status to In production — Testing mode expires refresh tokens after 7 days.",
      "missing_refresh_token",
    );
  }
  const expiresIn =
    typeof body.expires_in === "number" ? body.expires_in : 3600;
  return {
    accessToken: requiredAccessToken(body),
    refreshToken: body.refresh_token,
    expiresAt: (input.now ?? Date.now()) + expiresIn * 1000,
    scope: body.scope ?? GOOGLE_SCOPE_STRING,
  };
}

export async function refreshAccessToken(input: {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  fetcher?: typeof fetch;
  now?: number;
}): Promise<{
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
  expiresIn: number;
  scope?: string;
}> {
  const body = await postToken(
    {
      client_id: input.clientId,
      client_secret: input.clientSecret,
      refresh_token: input.refreshToken,
      grant_type: "refresh_token",
    },
    input.fetcher ?? fetch,
  );
  const expiresIn =
    typeof body.expires_in === "number" ? body.expires_in : 3600;
  return {
    accessToken: requiredAccessToken(body),
    refreshToken: body.refresh_token,
    expiresAt: (input.now ?? Date.now()) + expiresIn * 1000,
    expiresIn,
    scope: body.scope,
  };
}

export async function ensureFreshProps(
  props: GoogleProps,
  env: TokenSecrets,
  fetcher: typeof fetch = fetch,
  now = Date.now(),
): Promise<GoogleProps> {
  if (props.accessToken && props.expiresAt - REFRESH_SKEW_MS > now)
    return props;
  if (!props.refreshToken) {
    throw new GoogleOAuthError(
      "The Google access token expired and this session has no refresh token. Disconnect the MCP server and sign in again.",
      "missing_refresh_token",
    );
  }
  const refreshed = await refreshAccessToken({
    clientId: env.GOOGLE_CLIENT_ID,
    clientSecret: env.GOOGLE_CLIENT_SECRET,
    refreshToken: props.refreshToken,
    fetcher,
    now,
  });
  return {
    ...props,
    accessToken: refreshed.accessToken,
    refreshToken: refreshed.refreshToken ?? props.refreshToken,
    expiresAt: refreshed.expiresAt,
    scope: refreshed.scope ?? props.scope,
  };
}

export async function fetchGoogleUser(
  accessToken: string,
  fetcher: typeof fetch = fetch,
): Promise<{
  sub: string;
  email: string;
  name: string;
  emailVerified: boolean;
  hostedDomain: string;
}> {
  const response = await fetcher(USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const body = await readJson(response);
  if (!response.ok) {
    throw new GoogleOAuthError(
      `Google did not return a user profile (${response.status}).`,
      response.status >= 500
        ? "temporarily_unavailable"
        : "token_exchange_failed",
    );
  }
  const sub = stringField(body, "sub");
  const email = stringField(body, "email");
  if (!sub || !email) {
    throw new GoogleOAuthError(
      "Google did not return an account id and email. The OAuth client must request the openid and email scopes.",
      "token_exchange_failed",
    );
  }
  return {
    sub,
    email,
    name: stringField(body, "name") || email,
    emailVerified: body.email_verified === true,
    hostedDomain: stringField(body, "hd"),
  };
}

export function emailMatchesHostedDomain(
  email: string,
  hostedDomain: string,
): boolean {
  const domain = hostedDomain.trim().toLowerCase();
  if (!domain) return true;
  const at = email.lastIndexOf("@");
  if (at < 0) return false;
  return email.slice(at + 1).toLowerCase() === domain;
}

export function accountMatchesHostedDomain(
  account: { email: string; emailVerified: boolean; hostedDomain: string },
  hostedDomain: string,
): boolean {
  const domain = hostedDomain.trim().toLowerCase();
  if (!domain) return true;
  if (!account.emailVerified) return false;
  const hd = account.hostedDomain.trim().toLowerCase();
  if (hd && hd !== domain) return false;
  return emailMatchesHostedDomain(account.email, domain);
}

function requiredAccessToken(body: TokenResponse): string {
  if (!body.access_token) {
    throw new GoogleOAuthError(
      "Google token response did not include an access token.",
      "token_exchange_failed",
    );
  }
  return body.access_token;
}

async function postToken(
  fields: Record<string, string>,
  fetcher: typeof fetch,
): Promise<TokenResponse> {
  let response: Response;
  try {
    response = await fetcher(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(fields),
    });
  } catch {
    throw new GoogleOAuthError(
      "Could not reach Google's token endpoint.",
      "temporarily_unavailable",
    );
  }
  const body = (await readJson(response)) as TokenResponse;
  if (response.ok) return body;
  if (body.error === "invalid_grant") {
    throw new GoogleOAuthError(
      "Google rejected the refresh token (invalid_grant). Disconnect the MCP server and sign in again. If the consent screen is still in Testing, refresh tokens expire after 7 days — set publishing status to In production.",
      "invalid_grant",
    );
  }
  if (response.status === 429 || response.status >= 500) {
    throw new GoogleOAuthError(
      "Google's token endpoint is unavailable. Retry in a minute.",
      "temporarily_unavailable",
    );
  }
  const detail = body.error_description || body.error || "token request failed";
  throw new GoogleOAuthError(
    `Google token request failed (${response.status}): ${detail}`,
    "token_exchange_failed",
  );
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text();
  if (!text) return {};
  try {
    const parsed: unknown = JSON.parse(text);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      !Array.isArray(parsed)
    ) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    return {};
  }
  return {};
}

function stringField(body: Record<string, unknown>, key: string): string {
  const value = body[key];
  return typeof value === "string" ? value : "";
}

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}
