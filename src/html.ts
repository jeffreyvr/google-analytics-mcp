export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return "&#39;";
    }
  });
}

export function present(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

const UNCONFIGURED = new Set([
  "",
  "unset",
  "replace-me",
  "your-google-client-id",
  "your-google-client-secret",
]);

export function isConfiguredSecret(value: unknown): boolean {
  if (typeof value !== "string") return false;
  return !UNCONFIGURED.has(value.trim().toLowerCase());
}

const CSS = `
:root, html[data-theme="light"] {
  color-scheme: light;
  --bg: #fff;
  --ink: #000;
  --muted: #6b6b6b;
  --faint: #8d8d8d;
  --soft: #f2f2f2;
  --line: rgba(0,0,0,0.08);
  --bad: #d00000;
  --font: Inter, "Segoe UI", system-ui, sans-serif;
  --mono: ui-monospace, "SFMono-Regular", Menlo, monospace;
}
@media (prefers-color-scheme: dark) {
  html:not([data-theme="light"]) {
    color-scheme: dark;
    --bg: #000;
    --ink: #fff;
    --muted: #a1a1a6;
    --faint: #6e6e73;
    --soft: #2c2c2e;
    --line: rgba(255,255,255,0.12);
    --bad: #ff5c5c;
  }
}
html[data-theme="dark"] {
  color-scheme: dark;
  --bg: #000;
  --ink: #fff;
  --muted: #a1a1a6;
  --faint: #6e6e73;
  --soft: #2c2c2e;
  --line: rgba(255,255,255,0.12);
  --bad: #ff5c5c;
}
* { box-sizing: border-box; }
html, body { min-height: 100%; }
body {
  margin: 0;
  color: var(--ink);
  background: var(--bg);
  font: 16px/1.45 var(--font);
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
}
::selection { background: var(--ink); color: var(--bg); }
a { color: inherit; text-decoration: none; }
:focus-visible { outline: 2px solid var(--ink); outline-offset: 3px; }
button {
  appearance: none;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  cursor: pointer;
  padding: 0;
}
.main {
  width: min(480px, calc(100% - 40px));
  margin: 0 auto;
  padding: 8vh 0 72px;
}
.shell {
  width: min(440px, calc(100% - 40px));
  margin: 12vh auto 72px;
}
.marks {
  display: flex;
  gap: 10px;
  margin: 0 0 28px;
}
.marks svg { width: 28px; height: 28px; display: block; }
.intro { margin: 0 0 36px; }
.bridge {
  margin: 0 0 14px;
  font-size: 28px;
  font-weight: 600;
  letter-spacing: -0.03em;
  line-height: 1.15;
}
.products { display: flex; flex-wrap: wrap; gap: 8px; }
.product {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 7px 12px 7px 8px;
  border: 1px solid var(--line);
  border-radius: 12px;
  font-size: 14px;
  font-weight: 500;
  letter-spacing: -0.01em;
}
.product svg { width: 20px; height: 20px; display: block; flex: none; }
.kicker {
  margin: 0 0 4px;
  color: var(--faint);
  font-size: 14px;
  font-weight: 500;
}
.list .name {
  display: block;
  width: 100%;
  padding: 18px 0 8px;
  text-align: left;
  font-size: 18px;
  font-weight: 600;
  letter-spacing: -0.02em;
  color: var(--faint);
}
.list .item.on .name { color: var(--ink); }
.list .body { padding: 0 0 8px; }
.sub, .lede, .note {
  margin: 0;
  color: var(--muted);
  font-size: 16px;
  line-height: 1.45;
}
.sub a, .note a { color: var(--ink); font-weight: 500; }
.sub a:hover, .note a:hover { opacity: 0.6; }
.note { margin-top: 14px; }
.mono, .block {
  margin: 16px 0 0;
  color: var(--ink);
  font-family: var(--mono);
  font-size: 13px;
  line-height: 1.6;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.row, .pills {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 16px;
}
.pill, button.ghost, button.copy, button.primary, a.primary {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 44px;
  padding: 0 18px;
  border-radius: 999px;
  background: var(--soft);
  color: var(--ink);
  font-size: 15px;
  font-weight: 500;
}
.pill.solid, button.primary, a.primary, button.copy {
  background: var(--ink);
  color: var(--bg);
}
.pill:hover, button.ghost:hover, button.primary:hover, a.primary:hover, button.copy:hover { opacity: 0.82; }
.kv {
  margin-top: 16px;
  display: grid;
  gap: 8px;
}
.kv div {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  font-family: var(--mono);
  font-size: 13px;
}
.state.bad { color: var(--bad); font-weight: 600; }
footer {
  margin-top: 48px;
  color: var(--faint);
  font-size: 13px;
}
footer a { color: var(--muted); font-weight: 500; }
footer a:hover { color: var(--ink); }
.shell h1 {
  font-size: clamp(2rem, 5vw, 2.5rem);
  letter-spacing: -0.035em;
}
.auth-meta, .auth-card > p, .note-inline {
  margin: 14px 0 0;
  color: var(--muted);
  font-size: 1rem;
  line-height: 1.45;
}
.auth-meta strong, .note-inline strong { color: var(--ink); font-weight: 600; }
.grant-list { list-style: none; margin: 28px 0 0; padding: 0; text-align: left; }
.grant-list li {
  display: grid;
  gap: 3px;
  padding: 14px 0;
  border-top: 1px solid var(--line);
}
.grant-list li:last-child { border-bottom: 1px solid var(--line); }
.grant-list strong { font-weight: 600; }
.grant-list .detail {
  color: var(--faint);
  font-family: var(--mono);
  font-size: 0.72rem;
}
.actions { display: grid; gap: 8px; margin-top: 28px; }
.shell button.primary, .shell button.ghost { width: 100%; }
@media (max-width: 520px) {
  .main { padding-top: 36px; }
  .shell { margin-top: 40px; }
  .field { flex-direction: column; align-items: stretch; }
  .field .copy { align-self: flex-end; }
  .marks svg { width: 28px; height: 28px; }
}
`;

export function documentPage(
  title: string,
  body: string,
  script = "",
  options: { shell?: boolean } = {},
): string {
  const wrap = options.shell ? "shell" : "main";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="no-referrer">
<meta name="color-scheme" content="dark light">
<meta name="theme-color" content="#000000" media="(prefers-color-scheme: dark)">
<meta name="theme-color" content="#ffffff" media="(prefers-color-scheme: light)">
<title>${escapeHtml(title)}</title>
<script>
(function () {
  try {
    var chosen = new URLSearchParams(location.search).get("theme");
    var theme = chosen === "dark" || chosen === "light"
      ? chosen
      : (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    document.documentElement.setAttribute("data-theme", theme);
  } catch (e) {}
})();
</script>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
<style>${CSS}</style>
</head>
<body>
<div class="${wrap}">
${body}
</div>
${script}
</body>
</html>`;
}

export const COPY_SCRIPT = `<script>
document.querySelectorAll("[data-copy]").forEach((button) => {
  button.addEventListener("click", async () => {
    const value = button.getAttribute("data-copy") || "";
    const previous = button.textContent;
    try {
      await navigator.clipboard.writeText(value);
      button.textContent = "Copied";
    } catch {
      button.textContent = "Copy failed";
    }
    setTimeout(() => { button.textContent = previous; }, 1400);
  });
});
</script>`;
