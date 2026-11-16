import {
  GOOGLE_ANALYTICS_ICON,
  GOOGLE_SEARCH_CONSOLE_ICON,
} from "../assets/icons";
import {
  COPY_SCRIPT,
  documentPage,
  escapeHtml,
  isConfiguredSecret,
  present,
} from "../html";

const STEPS = ["Redirect", "Scopes", "APIs", "Secrets", "Connect"] as const;

const STEP_SCRIPT = `<script>
(function () {
  var items = Array.prototype.slice.call(document.querySelectorAll("[data-step]"));
  var label = document.querySelector("[data-step-label]");
  if (!items.length) return;

  function show(index) {
    if (index < 0 || index >= items.length) return;
    items.forEach(function (item, n) {
      var open = n === index;
      item.classList.toggle("on", open);
      var body = item.querySelector(".body");
      if (body) body.hidden = !open;
      var name = item.querySelector(".name");
      if (!name) return;
      if (open) name.setAttribute("aria-current", "step");
      else name.removeAttribute("aria-current");
    });
    if (label) label.textContent = "Step " + (index + 1) + " of " + items.length;
  }

  document.querySelectorAll("[data-go]").forEach(function (button) {
    button.addEventListener("click", function () {
      var current = items.findIndex(function (item) { return item.classList.contains("on"); });
      var move = button.getAttribute("data-move");
      show(move ? current + Number(move) : Number(button.getAttribute("data-go")));
    });
  });

  document.addEventListener("keydown", function (event) {
    if (event.target && (event.target.tagName === "INPUT" || event.target.tagName === "TEXTAREA")) return;
    var current = items.findIndex(function (item) { return item.classList.contains("on"); });
    if (event.key === "ArrowDown" || event.key === "ArrowRight") show(current + 1);
    if (event.key === "ArrowUp" || event.key === "ArrowLeft") show(current - 1);
  });

  show(0);
})();
</script>`;

export const GOOGLE_LINKS = {
  analyticsDataApi:
    "https://console.cloud.google.com/apis/library/analyticsdata.googleapis.com",
  analyticsAdminApi:
    "https://console.cloud.google.com/apis/library/analyticsadmin.googleapis.com",
  searchConsoleApi:
    "https://console.cloud.google.com/apis/library/searchconsole.googleapis.com",
  oauthClients: "https://console.cloud.google.com/auth/clients",
  classicCredentials: "https://console.cloud.google.com/apis/credentials",
  audience: "https://console.cloud.google.com/auth/audience",
  classicConsent: "https://console.cloud.google.com/apis/credentials/consent",
  scopes: "https://console.cloud.google.com/auth/scopes",
} as const;

export type SetupModel = {
  origin: string;
  redirectUri: string;
  mcpUrl: string;
  clientIdSet: boolean;
  clientSecretSet: boolean;
  hostedDomain: string;
  resourceOverride: string;
};

export function setupModel(request: Request, env: Env): SetupModel {
  const origin = new URL(request.url).origin;
  const override = present(env.MCP_RESOURCE);
  return {
    origin,
    redirectUri: `${origin}/callback`,
    mcpUrl: override || `${origin}/mcp`,
    clientIdSet: isConfiguredSecret(env.GOOGLE_CLIENT_ID),
    clientSecretSet: isConfiguredSecret(env.GOOGLE_CLIENT_SECRET),
    hostedDomain: present(env.HOSTED_DOMAIN),
    resourceOverride: override,
  };
}

export function renderSetupPage(model: SetupModel): string {
  const ready = model.clientIdSet && model.clientSecretSet;
  const redirect = escapeHtml(model.redirectUri);
  const mcp = escapeHtml(model.mcpUrl);
  const bodies = [
    `
    <p class="sub">Create a <a href="${GOOGLE_LINKS.oauthClients}">Web application OAuth client</a> and use this exact URI. <a href="${GOOGLE_LINKS.classicCredentials}">Classic credentials</a> if that page is missing.</p>
    <p class="mono">${redirect}</p>
    <div class="row">
      <button class="pill solid" type="button" data-copy="${redirect}">Copy</button>
      <button class="pill" type="button" data-move="1">Next</button>
    </div>`,
    `
    <p class="sub">On the Data access page. Set the consent screen to <a href="${GOOGLE_LINKS.audience}"><strong>In production</strong></a>. Testing expires refresh tokens after 7 days.</p>
    <p class="mono">openid
https://www.googleapis.com/auth/userinfo.email
https://www.googleapis.com/auth/analytics.readonly
https://www.googleapis.com/auth/webmasters.readonly</p>
    <div class="row">
      <a class="pill solid" href="${GOOGLE_LINKS.scopes}">Open scopes</a>
      <button class="pill" type="button" data-move="1">Next</button>
    </div>`,
    `
    <p class="sub">Same Google Cloud project.</p>
    <div class="row">
      <a class="pill" href="${GOOGLE_LINKS.analyticsDataApi}">Analytics Data</a>
      <a class="pill" href="${GOOGLE_LINKS.analyticsAdminApi}">Analytics Admin</a>
      <a class="pill" href="${GOOGLE_LINKS.searchConsoleApi}">Search Console</a>
    </div>
    <div class="row"><button class="pill solid" type="button" data-move="1">Next</button></div>`,
    `
    <div class="kv">
      <div><span>GOOGLE_CLIENT_ID</span>${status(model.clientIdSet)}</div>
      <div><span>GOOGLE_CLIENT_SECRET</span>${status(model.clientSecretSet)}</div>
    </div>
    ${
      ready
        ? `<p class="note">Values are not shown here.</p>`
        : `<p class="mono">npx wrangler secret put GOOGLE_CLIENT_ID
npx wrangler secret put GOOGLE_CLIENT_SECRET</p>
    <p class="note">Reload this page after.</p>`
    }
    <p class="note">${
      model.hostedDomain
        ? `Only <span class="mono">${escapeHtml(model.hostedDomain)}</span> accounts can sign in.`
        : "Any Google account can sign in. Set HOSTED_DOMAIN to limit it to one Workspace domain."
    }</p>
    <div class="row"><button class="pill" type="button" data-move="1">Next</button></div>`,
    `
    <p class="sub">Claude, Cursor, or Grok Bot. Leave Client ID blank. It registers itself.</p>
    <p class="mono">${mcp}</p>
    <div class="row"><button class="pill solid" type="button" data-copy="${mcp}">Copy</button></div>
    ${
      model.resourceOverride
        ? `<p class="note">Tokens are pinned to <span class="mono">${escapeHtml(model.resourceOverride)}</span>.</p>`
        : ""
    }`,
  ];
  const items = STEPS.map((name, index) => {
    const open = index === 0;
    return `<section class="item${open ? " on" : ""}" data-step="${index}">
      <button class="name" type="button" data-go="${index}"${open ? ' aria-current="step"' : ""}>${index + 1} ${name}</button>
      <div class="body"${open ? "" : " hidden"}>${bodies[index]}</div>
    </section>`;
  }).join("");

  return documentPage(
    "Setup",
    `
<header class="intro">
  <p class="bridge">MCP Auth bridge for</p>
  <div class="products">
    <span class="product">${GOOGLE_ANALYTICS_ICON}Google Analytics</span>
    <span class="product">${GOOGLE_SEARCH_CONSOLE_ICON}Search Console</span>
  </div>
</header>
<p class="kicker" data-step-label>Step 1 of ${STEPS.length}</p>
<div class="list">${items}</div>
<footer>
  Unofficial, not affiliated with Google.
  <a href="https://vanrossum.dev/contact">Want this hosted?</a>
</footer>
`,
    `${COPY_SCRIPT}\n${STEP_SCRIPT}`,
  );
}

function status(set: boolean): string {
  return set
    ? '<span class="state">Set</span>'
    : '<span class="state bad">Missing</span>';
}
