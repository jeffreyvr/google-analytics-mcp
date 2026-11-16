# MCP auth bridge for GA4 and Search Console

Connect Claude, Cursor, Grok Bot, or any remote MCP client to **your** Google Analytics 4 and Search Console data.

You deploy your own Cloudflare Worker and Google OAuth client. There is no shared hosted service, and you do not need Google app verification for personal use.

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/jeffreyvr/google-analytics-mcp)

---

## Quick setup

### 1. Deploy

**Easiest:** click Deploy to Cloudflare. It creates the KV namespace and asks for:

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`

You can leave those blank for a minute and set them after Google Cloud is ready.

**Or with Wrangler:**

```bash
npm install
npx wrangler login
npx wrangler kv namespace create OAUTH_KV
```

Put the new namespace id into `wrangler.jsonc`, then:

```bash
npx wrangler secret put GOOGLE_CLIENT_ID
npx wrangler secret put GOOGLE_CLIENT_SECRET
npx wrangler deploy
```

Open your Worker URL. The home page walks through the rest and shows the exact redirect URI to copy.

### 2. Google Cloud (same project for everything)

1. [Create a Web application OAuth client](https://console.cloud.google.com/auth/clients).
2. Paste the redirect URI from your Worker home page, for example:

   `https://<your-worker>.workers.dev/callback`

3. Add these scopes under Data access:

   - `openid`
   - `https://www.googleapis.com/auth/userinfo.email`
   - `https://www.googleapis.com/auth/analytics.readonly`
   - `https://www.googleapis.com/auth/webmasters.readonly`

4. Enable these APIs:

   - [Analytics Data API](https://console.cloud.google.com/apis/library/analyticsdata.googleapis.com)
   - [Analytics Admin API](https://console.cloud.google.com/apis/library/analyticsadmin.googleapis.com)
   - [Search Console API](https://console.cloud.google.com/apis/library/searchconsole.googleapis.com)

5. Set the consent screen to **In production** ([audience settings](https://console.cloud.google.com/auth/audience)).

   Testing mode expires refresh tokens after 7 days. Google may show an “unverified app” warning for these scopes — choose Advanced and continue. That is normal for a private app. Workspace users can use **Internal** instead.

6. Put the client id and secret on the Worker if you have not already:

```bash
npx wrangler secret put GOOGLE_CLIENT_ID
npx wrangler secret put GOOGLE_CLIENT_SECRET
```

Reload `/`. Both secrets should say **Set**.

### 3. Connect an AI client

Copy the MCP URL from the setup page:

`https://<your-worker>.workers.dev/mcp`

| Client | What to do |
| --- | --- |
| Claude | Add a custom connector with that URL |
| Cursor | Add a remote MCP / HTTPS server with that URL |
| Grok Bot | Add a custom connector → Remote HTTPS → paste the URL → leave Client ID blank |

The first connection opens this Worker’s consent page, then Google. Sign in with an account that can view the GA4 property and Search Console property.

---

## What you get

Read-only tools for:

- GA4 accounts and properties
- Historical and realtime reports
- Available dimensions and metrics
- Search Console sites, performance, sitemaps, and URL inspection

Reports come back compact (short heading + table). Errors say the useful thing: API not enabled, no access to the property, bad field name, or dead refresh token.

---

## Local development

```bash
npm install
cp .dev.vars.example .dev.vars
```

Put a Google client id and secret in `.dev.vars`, and add `http://localhost:8794/callback` as a redirect URI.

```bash
npm run dev
```

Then open [http://localhost:8794](http://localhost:8794).

```bash
npm run typecheck
npm run lint
npm test
```

---

## Optional knobs

Leave these blank unless you need them:

- `HOSTED_DOMAIN` — only allow Google accounts on one Workspace domain
- `MCP_RESOURCE` — pin tokens to a public MCP URL that differs from the request host

---

## Want this hosted?

Self-hosted only for now.

[Want this hosted?](https://vanrossum.dev/contact)

---

## Notes

- Unofficial. Not affiliated with Google.
- The MCP URL is public. A caller still needs a bearer token from this Worker, issued only after the consent screen and Google sign-in. Google refresh tokens stay encrypted in KV. The MCP client never receives them.
- The home page shows whether the two Google secrets are set. It does not show their values.
- Leave the Worker URL private if you do not want other people to start a connection. Set `HOSTED_DOMAIN` to allow only verified accounts on one Workspace domain.
- Live Google OAuth and live Analytics/Search Console calls are not covered by the unit tests — confirm with your own account after deploy.
- MIT licensed. Brand icons on the setup/auth pages come from [theSVG](https://thesvg.org).
