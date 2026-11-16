import type { ConsentDescription } from "@cloudflare/workers-oauth-provider";
import {
  GOOGLE_ANALYTICS_ICON,
  GOOGLE_SEARCH_CONSOLE_ICON,
} from "../assets/icons";
import { documentPage, escapeHtml } from "../html";
import { MCP_SCOPES, SCOPE_COPY } from "./scopes";

export function renderConsentPage(
  details: ConsentDescription,
  handle: string,
): string {
  const name = escapeHtml(details.clientName);
  const publisher = details.clientDomain
    ? `Published by <strong>${escapeHtml(details.clientDomain)}</strong>.`
    : "This app registered itself, so its name is not verified.";
  const scopes = MCP_SCOPES.map((scope) => {
    return `<li>
      <strong>${escapeHtml(SCOPE_COPY[scope])}</strong>
      <span class="detail">${escapeHtml(scope)}</span>
      <input type="hidden" name="scope" value="${escapeHtml(scope)}">
    </li>`;
  }).join("");
  const loopback = details.redirectIsLoopback
    ? `<p class="note-inline">This sends access to an app on your computer (<strong>${escapeHtml(details.redirectHost)}</strong>). Continue only if you started this from that app.</p>`
    : "";

  return documentPage(
    `Allow ${details.clientName}`,
    `
<div class="auth-card">
  <div class="marks" aria-hidden="true">
    ${GOOGLE_ANALYTICS_ICON}
    ${GOOGLE_SEARCH_CONSOLE_ICON}
  </div>
  <h1>Allow ${name} to read your analytics?</h1>
  <p class="auth-meta">${publisher} Access goes to <strong>${escapeHtml(details.redirectHost)}</strong>.</p>
  ${loopback}
  <p>Google will ask for read-only Analytics and Search Console, plus your email. A refresh token keeps the connection alive.</p>
  <ul class="grant-list">${scopes}</ul>
  <form method="post" action="/authorize">
    <input type="hidden" name="handle" value="${escapeHtml(handle)}">
    <div class="actions">
      <button class="primary" type="submit" name="decision" value="approve">Continue with Google</button>
      <button class="ghost" type="submit" name="decision" value="deny">Deny</button>
    </div>
  </form>
</div>
`,
    "",
    { shell: true },
  );
}
