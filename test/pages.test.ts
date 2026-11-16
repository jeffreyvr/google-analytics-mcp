import { describe, expect, it } from "vitest";
import { renderConsentPage } from "../src/auth/consent";
import {
  GOOGLE_LINKS,
  renderSetupPage,
  type SetupModel,
} from "../src/setup/page";

const model: SetupModel = {
  origin: "https://ga.example.workers.dev",
  redirectUri: "https://ga.example.workers.dev/callback",
  mcpUrl: "https://ga.example.workers.dev/mcp",
  clientIdSet: false,
  clientSecretSet: true,
  hostedDomain: "",
  resourceOverride: "",
};

describe("setup page", () => {
  it("shows the redirect URI, MCP URL, API links, and secret status without secret values", () => {
    const html = renderSetupPage({ ...model, clientSecretSet: true });
    expect(html).toContain("https://ga.example.workers.dev/callback");
    expect(html).toContain("https://ga.example.workers.dev/mcp");
    expect(html).toContain(
      'data-copy="https://ga.example.workers.dev/callback"',
    );
    expect(html).toContain(GOOGLE_LINKS.analyticsDataApi);
    expect(html).toContain(GOOGLE_LINKS.analyticsAdminApi);
    expect(html).toContain(GOOGLE_LINKS.searchConsoleApi);
    expect(html).toContain(GOOGLE_LINKS.oauthClients);
    expect(html).toContain("In production");
    expect(html).toContain("GOOGLE_CLIENT_ID");
    expect(html).toContain("Missing");
    expect(html).toContain("Set");
    expect(html).toContain("viewBox");
    expect(html).not.toContain("super-secret");
    expect(html).toContain("MCP Auth bridge for");
    expect(html).toContain("Google Analytics");
    expect(html).toContain("Search Console");
    expect(html).toContain("Want this hosted?");
    expect(html).toContain("https://vanrossum.dev/contact");
    expect(html).not.toContain("example.com/google-analytics-mcp-waitlist");
  });

  it("escapes a hostile host", () => {
    const html = renderSetupPage({
      ...model,
      redirectUri: `https://evil.example/callback"><script>alert(1)</script>`,
    });
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
  });
});

describe("consent page", () => {
  it("shows the client, redirect host, both grants, icons, and escapes the client name", () => {
    const html = renderConsentPage(
      {
        clientId: "https://claude.ai",
        clientName: `<img src=x onerror=alert(1)>`,
        clientDomain: "claude.ai",
        redirectUri: "https://claude.ai/api/mcp/auth_callback",
        redirectHost: "claude.ai",
        redirectIsLoopback: false,
        scope: ["analytics.readonly", "webmasters.readonly"],
      },
      "handle-1",
    );
    expect(html).toContain("Published by <strong>claude.ai</strong>");
    expect(html).toContain("claude.ai");
    expect(html).toContain("analytics.readonly");
    expect(html).toContain("webmasters.readonly");
    expect(html).toContain("Continue with Google");
    expect(html).toContain('name="handle" value="handle-1"');
    expect(html).toContain('fill="#f9ab00"');
    expect(html).toContain('fill="#4285f4"');
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;img");
  });

  it("warns when tokens will be sent to localhost", () => {
    const html = renderConsentPage(
      {
        clientId: "local",
        clientName: "Cursor",
        redirectUri: "http://localhost:3344/callback",
        redirectHost: "localhost",
        redirectIsLoopback: true,
        scope: [],
      },
      "handle-2",
    );
    expect(html).toContain("app on your computer");
    expect(html).toContain("not verified");
  });
});
