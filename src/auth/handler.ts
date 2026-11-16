import {
  AuthorizationError,
  authorizationErrorRedirect,
  CimdFetchError,
  type OAuthHelpers,
} from "@cloudflare/workers-oauth-provider";
import { Hono } from "hono";
import {
  accountMatchesHostedDomain,
  buildGoogleAuthorizeUrl,
  createPkcePair,
  exchangeAuthorizationCode,
  fetchGoogleUser,
  GoogleOAuthError,
} from "../google/oauth";
import { present } from "../html";
import { renderSetupPage, setupModel } from "../setup/page";
import previewHtml from "../setup/preview.html";
import { renderConsentPage } from "./consent";
import type { GoogleProps } from "./props";
import { isMcpScope, MCP_SCOPES } from "./scopes";

type AppBindings = Env & { OAUTH_PROVIDER: OAuthHelpers };

const app = new Hono<{ Bindings: AppBindings }>();

app.get("/", (c) => {
  return html(renderSetupPage(setupModel(c.req.raw, c.env)));
});

app.get("/preview", () => html(previewHtml));

app.get("/authorize", async (c) => {
  const oauth = c.env.OAUTH_PROVIDER;
  try {
    const request = await oauth.parseAuthRequest(c.req.raw);
    const details = await oauth.describeConsent(request);
    const consent = await oauth.beginConsent(request);
    consent.headers.set("Content-Type", "text/html; charset=utf-8");
    return new Response(renderConsentPage(details, consent.handle), {
      headers: consent.headers,
    });
  } catch (error) {
    return authError(error);
  }
});

app.post("/authorize", async (c) => {
  const oauth = c.env.OAUTH_PROVIDER;
  const form = await c.req.raw.formData();
  const handle = String(form.get("handle") ?? "");
  try {
    if (form.get("decision") !== "approve") {
      const denied = await oauth.denyConsent(c.req.raw, handle);
      return new Response(null, { status: 302, headers: denied.headers });
    }
    const selected = form.getAll("scope").map(String).filter(isMcpScope);
    const scope = selected.length > 0 ? selected : [...MCP_SCOPES];
    const approved = await oauth.approveConsent(c.req.raw, handle, { scope });
    if (
      !present(c.env.GOOGLE_CLIENT_ID) ||
      !present(c.env.GOOGLE_CLIENT_SECRET)
    ) {
      return text(
        "Google OAuth client secrets are not set on this Worker. Open the setup page at / and finish step 3.",
        500,
      );
    }
    const { verifier, challenge } = await createPkcePair();
    const upstream = await oauth.beginUpstream(approved.request, {
      data: { verifier, scope },
      headers: approved.headers,
    });
    upstream.headers.set(
      "Location",
      buildGoogleAuthorizeUrl({
        clientId: c.env.GOOGLE_CLIENT_ID,
        redirectUri: new URL("/callback", c.req.url).href,
        state: upstream.state,
        codeChallenge: challenge,
        hostedDomain: present(c.env.HOSTED_DOMAIN),
      }),
    );
    return new Response(null, { status: 302, headers: upstream.headers });
  } catch (error) {
    return authError(error);
  }
});

app.get("/callback", async (c) => {
  const oauth = c.env.OAUTH_PROVIDER;
  type UpstreamData = { verifier?: string; scope?: string[] };
  let resumed: Awaited<ReturnType<OAuthHelpers["finishUpstream"]>> & {
    data: UpstreamData;
  };
  try {
    resumed = await oauth.finishUpstream<UpstreamData>(c.req.raw);
  } catch (error) {
    return authError(error);
  }

  const params = new URL(c.req.url).searchParams;
  if (params.get("error")) {
    resumed.headers.set(
      "Location",
      authorizationErrorRedirect(resumed.request, "access_denied"),
    );
    return new Response(null, { status: 302, headers: resumed.headers });
  }

  const code = params.get("code");
  const verifier = resumed.data.verifier;
  if (!code || !verifier)
    return text(
      "Google did not return an authorization code. Start the connection again.",
      400,
    );

  try {
    const token = await exchangeAuthorizationCode({
      clientId: c.env.GOOGLE_CLIENT_ID,
      clientSecret: c.env.GOOGLE_CLIENT_SECRET,
      code,
      redirectUri: new URL("/callback", c.req.url).href,
      codeVerifier: verifier,
    });
    const user = await fetchGoogleUser(token.accessToken);
    const hostedDomain = present(c.env.HOSTED_DOMAIN);
    if (!accountMatchesHostedDomain(user, hostedDomain)) {
      return text(
        `This server only accepts verified Google accounts on ${hostedDomain}. You signed in as ${user.email}.`,
        403,
      );
    }
    const scope = (resumed.data.scope ?? []).filter(isMcpScope);
    const props: GoogleProps = {
      sub: user.sub,
      email: user.email,
      name: user.name,
      accessToken: token.accessToken,
      refreshToken: token.refreshToken,
      expiresAt: token.expiresAt,
      scope: token.scope,
    };
    const { redirectTo } = await oauth.completeAuthorization({
      request: resumed.request,
      userId: user.sub,
      metadata: { label: user.email },
      scope: scope.length > 0 ? scope : [...MCP_SCOPES],
      props,
    });
    resumed.headers.set("Location", redirectTo);
    return new Response(null, { status: 302, headers: resumed.headers });
  } catch (error) {
    if (error instanceof GoogleOAuthError)
      return text(
        error.message,
        error.code === "temporarily_unavailable" ? 503 : 400,
      );
    throw error;
  }
});

function authError(error: unknown): Response {
  if (error instanceof AuthorizationError && error.redirectTo) {
    return Response.redirect(error.redirectTo, 302);
  }
  if (error instanceof AuthorizationError) return text(error.description, 400);
  if (error instanceof CimdFetchError)
    return text(
      "This MCP client could not be verified. Try connecting again.",
      400,
    );
  throw error;
}

function html(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      // Setup pages are safe to embed (Cursor Simple Browser uses a frame).
      // Consent stays locked down via beginConsent() headers.
      "Content-Security-Policy":
        "default-src 'none'; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; script-src 'unsafe-inline'; base-uri 'none'; form-action 'self'",
      "Referrer-Policy": "no-referrer",
    },
  });
}

function text(message: string, status: number): Response {
  return new Response(message, {
    status,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

export function handleAuthRequest(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
): Response | Promise<Response> {
  return app.fetch(request, env as AppBindings, ctx);
}
