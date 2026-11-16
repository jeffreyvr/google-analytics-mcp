import { describe, expect, it } from "vitest";
import type { GoogleProps } from "../src/auth/props";
import { GOOGLE_SCOPE_STRING } from "../src/auth/scopes";
import { createGoogleClient } from "../src/google/client";
import {
  accountMatchesHostedDomain,
  buildGoogleAuthorizeUrl,
  createPkcePair,
  emailMatchesHostedDomain,
  ensureFreshProps,
  GoogleOAuthError,
} from "../src/google/oauth";
import { resolveResource } from "../src/resource";

const secrets = { GOOGLE_CLIENT_ID: "client", GOOGLE_CLIENT_SECRET: "secret" };

function props(overrides: Partial<GoogleProps> = {}): GoogleProps {
  return {
    sub: "123",
    email: "ada@example.com",
    name: "Ada",
    accessToken: "access-1",
    refreshToken: "refresh-1",
    expiresAt: Date.now() + 60 * 60 * 1000,
    scope: GOOGLE_SCOPE_STRING,
    ...overrides,
  };
}

describe("Google OAuth", () => {
  it("asks for offline access, consent, both read scopes, and PKCE", () => {
    const url = new URL(
      buildGoogleAuthorizeUrl({
        clientId: "client",
        redirectUri: "https://mcp.example/callback",
        state: "state-1",
        codeChallenge: "challenge",
        hostedDomain: "example.com",
      }),
    );
    expect(url.origin + url.pathname).toBe(
      "https://accounts.google.com/o/oauth2/v2/auth",
    );
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("prompt")).toBe("consent");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("hd")).toBe("example.com");
    expect(url.searchParams.get("scope")).toContain(
      "https://www.googleapis.com/auth/analytics.readonly",
    );
    expect(url.searchParams.get("scope")).toContain(
      "https://www.googleapis.com/auth/webmasters.readonly",
    );
    expect(url.searchParams.get("scope")).toContain("openid");
    expect(url.searchParams.get("scope")).toContain("email");
    expect(url.searchParams.has("include_granted_scopes")).toBe(false);
  });

  it("omits the hosted-domain hint when it is blank", () => {
    const url = new URL(
      buildGoogleAuthorizeUrl({
        clientId: "client",
        redirectUri: "https://mcp.example/callback",
        state: "state-1",
        codeChallenge: "challenge",
        hostedDomain: "  ",
      }),
    );
    expect(url.searchParams.has("hd")).toBe(false);
  });

  it("creates a PKCE pair Google will accept", async () => {
    const pair = await createPkcePair();
    expect(pair.verifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(pair.challenge).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(pair.challenge).not.toBe(pair.verifier);
  });

  it("reuses an access token that is still fresh", async () => {
    let called = false;
    const fetcher = (() => {
      called = true;
      return Promise.resolve(new Response(""));
    }) as typeof fetch;
    const current = props();
    const next = await ensureFreshProps(current, secrets, fetcher);
    expect(next).toBe(current);
    expect(called).toBe(false);
  });

  it("refreshes an expired access token and keeps a rotated refresh token", async () => {
    let body = "";
    const fetcher = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      body = String(init?.body);
      return Response.json({
        access_token: "access-2",
        expires_in: 3600,
        refresh_token: "refresh-2",
        scope: "openid",
      });
    }) as typeof fetch;
    const now = 1_700_000_000_000;
    const next = await ensureFreshProps(
      props({ expiresAt: now - 1000 }),
      secrets,
      fetcher,
      now,
    );
    expect(next.accessToken).toBe("access-2");
    expect(next.refreshToken).toBe("refresh-2");
    expect(next.expiresAt).toBe(now + 3600 * 1000);
    expect(body).toContain("grant_type=refresh_token");
    expect(body).toContain("refresh_token=refresh-1");
  });

  it("tells the caller when Google has revoked the refresh token", async () => {
    const fetcher = (async () =>
      Response.json(
        { error: "invalid_grant", error_description: "expired" },
        { status: 400 },
      )) as typeof fetch;
    await expect(
      ensureFreshProps(props({ expiresAt: 0 }), secrets, fetcher),
    ).rejects.toBeInstanceOf(GoogleOAuthError);
    await expect(
      ensureFreshProps(props({ expiresAt: 0 }), secrets, fetcher),
    ).rejects.toMatchObject({ code: "invalid_grant" });
  });

  it("matches a Workspace domain and ignores a blank restriction", () => {
    expect(emailMatchesHostedDomain("ada@example.com", "example.com")).toBe(
      true,
    );
    expect(emailMatchesHostedDomain("ada@other.com", "example.com")).toBe(
      false,
    );
    expect(emailMatchesHostedDomain("ada@example.com", "  ")).toBe(true);
    expect(emailMatchesHostedDomain("ada@notexample.com", "example.com")).toBe(
      false,
    );
  });

  it("requires a verified Workspace account when sign-in is restricted", () => {
    const account = {
      email: "ada@example.com",
      emailVerified: true,
      hostedDomain: "example.com",
    };
    expect(accountMatchesHostedDomain(account, "example.com")).toBe(true);
    expect(accountMatchesHostedDomain(account, "  ")).toBe(true);
    expect(
      accountMatchesHostedDomain(
        { ...account, emailVerified: false },
        "example.com",
      ),
    ).toBe(false);
    expect(
      accountMatchesHostedDomain(
        { ...account, hostedDomain: "other.com" },
        "example.com",
      ),
    ).toBe(false);
    expect(
      accountMatchesHostedDomain(
        { ...account, email: "ada@other.com" },
        "example.com",
      ),
    ).toBe(false);
  });

  it("refuses to send the Google access token off Google's hosts", async () => {
    let called = false;
    const fetcher = (() => {
      called = true;
      return Promise.resolve(Response.json({}));
    }) as typeof fetch;
    const client = createGoogleClient(props(), secrets, fetcher);
    await expect(client.get("https://evil.example/steal")).rejects.toThrow(
      /non-Google/,
    );
    await expect(
      client.get("https://user:pass@www.googleapis.com/oauth2/v3/userinfo"),
    ).rejects.toThrow(/non-Google/);
    expect(called).toBe(false);
    await expect(
      client.get("https://www.googleapis.com/oauth2/v3/userinfo"),
    ).resolves.toEqual({});
    expect(called).toBe(true);
  });
});

describe("resource URL", () => {
  it("follows the request host when MCP_RESOURCE is blank", () => {
    const request = new Request("https://ga.example.workers.dev/mcp");
    expect(resolveResource(request, "")).toEqual({
      resource: "https://ga.example.workers.dev/mcp",
      issuer: "https://ga.example.workers.dev",
    });
  });

  it("uses an explicit MCP_RESOURCE and drops a trailing slash", () => {
    const request = new Request("http://localhost:8794/mcp");
    expect(
      resolveResource(request, "https://ga.example.workers.dev/mcp/"),
    ).toEqual({
      resource: "https://ga.example.workers.dev/mcp",
      issuer: "https://ga.example.workers.dev",
    });
  });
});
