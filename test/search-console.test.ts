import { describe, expect, it } from "vitest";
import {
  gscInspectSchema,
  gscSearchAnalyticsSchema,
} from "../src/tools/schemas";
import {
  buildSearchAnalyticsBody,
  encodeSiteUrl,
  formatInspection,
  formatSearchAnalytics,
  formatSitemaps,
  formatSites,
  searchAnalytics,
} from "../src/tools/search-console";

const queryInput = gscSearchAnalyticsSchema.parse({
  siteUrl: "https://example.com/",
  startDate: "2026-10-01",
  endDate: "2026-10-31",
  dimensions: ["query", "page"],
  searchType: "web",
  filters: [{ dimension: "query", operator: "contains", expression: "mcp" }],
  rowLimit: 10,
});

describe("Search Console input handling", () => {
  it("encodes the site URL for the path", () => {
    expect(encodeSiteUrl("https://example.com/")).toBe(
      "https%3A%2F%2Fexample.com%2F",
    );
    expect(encodeSiteUrl("sc-domain:example.com")).toBe(
      "sc-domain%3Aexample.com",
    );
  });

  it("rejects a date that is not YYYY-MM-DD and an unknown dimension", () => {
    expect(
      gscSearchAnalyticsSchema.safeParse({
        ...queryInput,
        startDate: "7daysAgo",
      }).success,
    ).toBe(false);
    expect(
      gscSearchAnalyticsSchema.safeParse({
        ...queryInput,
        dimensions: ["hour"],
      }).success,
    ).toBe(false);
  });

  it("builds a search analytics query", () => {
    expect(buildSearchAnalyticsBody(queryInput)).toEqual({
      startDate: "2026-10-01",
      endDate: "2026-10-31",
      dimensions: ["query", "page"],
      type: "web",
      rowLimit: 10,
      dimensionFilterGroups: [
        {
          groupType: "and",
          filters: [
            { dimension: "query", operator: "contains", expression: "mcp" },
          ],
        },
      ],
    });
  });

  it("requires a full inspection URL", () => {
    expect(
      gscInspectSchema.safeParse({
        siteUrl: "https://example.com/",
        inspectionUrl: "/docs",
      }).success,
    ).toBe(false);
    expect(
      gscInspectSchema.safeParse({
        siteUrl: "https://example.com/",
        inspectionUrl: "https://example.com/docs",
      }).success,
    ).toBe(true);
  });

  it("posts the encoded site URL", async () => {
    let seen = "";
    const client = {
      get: async () => ({}),
      post: async (url: string) => {
        seen = url;
        return { rows: [] };
      },
    };
    await searchAnalytics(client, queryInput);
    expect(seen).toBe(
      "https://www.googleapis.com/webmasters/v3/sites/https%3A%2F%2Fexample.com%2F/searchAnalytics/query",
    );
  });
});

describe("Search Console response formatting", () => {
  it("keeps site URLs exact", () => {
    const text = formatSites([
      { siteUrl: "https://example.com/", permissionLevel: "siteOwner" },
      { siteUrl: "sc-domain:example.com", permissionLevel: "siteFullUser" },
    ]);
    expect(text).toContain("https://example.com/\tsiteOwner");
    expect(text).toContain("sc-domain:example.com\tsiteFullUser");
  });

  it("formats clicks, CTR, and position", () => {
    const text = formatSearchAnalytics("https://example.com/", queryInput, {
      rows: [
        {
          keys: ["mcp server", "https://example.com/mcp"],
          clicks: 4,
          impressions: 40,
          ctr: 0.1,
          position: 3.25,
        },
      ],
    });
    expect(text).toContain("query\tpage\tclicks\timpressions\tctr\tposition");
    expect(text).toContain(
      "mcp server\thttps://example.com/mcp\t4\t40\t10.00%\t3.3",
    );
  });

  it("summarizes a URL inspection", () => {
    const text = formatInspection(
      {
        siteUrl: "https://example.com/",
        inspectionUrl: "https://example.com/docs",
        languageCode: "en-US",
      },
      {
        inspectionResult: {
          inspectionResultLink:
            "https://search.google.com/search-console/inspect",
          indexStatusResult: {
            verdict: "PASS",
            coverageState: "Submitted and indexed",
            indexingState: "INDEXING_ALLOWED",
            robotsTxtState: "ALLOWED",
            pageFetchState: "SUCCESSFUL",
            lastCrawlTime: "2026-11-01T00:00:00Z",
            crawledAs: "MOBILE",
            googleCanonical: "https://example.com/docs",
            userCanonical: "https://example.com/docs",
          },
          mobileUsabilityResult: { verdict: "PASS" },
        },
      },
    );
    expect(text).toContain("Verdict: PASS");
    expect(text).toContain("Coverage: Submitted and indexed");
    expect(text).toContain("Google canonical: https://example.com/docs");
    expect(text).toContain("Rich results: not returned");
  });

  it("lists sitemap indexes separately from urlsets", () => {
    const text = formatSitemaps("https://example.com/", [
      {
        path: "https://example.com/sitemap.xml",
        isSitemapsIndex: true,
        errors: "0",
        warnings: "1",
        lastDownloaded: "2026-11-01",
      },
    ]);
    expect(text).toContain(
      "https://example.com/sitemap.xml\tindex\terrors=0\twarnings=1\t2026-11-01",
    );
  });
});
