import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import type { GoogleClient } from "../google/client";
import {
  asRecord,
  formatCtr,
  formatPosition,
  numberField,
  stringField,
  tsv,
} from "./format";
import { asToolResult } from "./result";
import {
  type GscInspectInput,
  type GscSearchAnalyticsInput,
  type GscSitemapsInput,
  gscInspectSchema,
  gscSearchAnalyticsSchema,
  gscSitemapsSchema,
} from "./schemas";

const WEBMASTERS = "https://www.googleapis.com/webmasters/v3";
const INSPECT =
  "https://searchconsole.googleapis.com/v1/urlInspection/index:inspect";

const READ_ONLY = {
  readOnlyHint: true,
  destructiveHint: false,
  openWorldHint: true,
} as const;

export function encodeSiteUrl(siteUrl: string): string {
  const trimmed = siteUrl.trim();
  if (!trimmed)
    throw new Error(
      "siteUrl is required. Call gsc_list_sites and copy the property URL exactly.",
    );
  return encodeURIComponent(trimmed);
}

export function buildSearchAnalyticsBody(
  input: GscSearchAnalyticsInput,
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    startDate: input.startDate,
    endDate: input.endDate,
    type: input.searchType,
    rowLimit: input.rowLimit,
  };
  if (input.dimensions.length > 0) body.dimensions = input.dimensions;
  if (input.startRow) body.startRow = input.startRow;
  if (input.dataState) body.dataState = input.dataState;
  if (input.filters && input.filters.length > 0) {
    body.dimensionFilterGroups = [
      {
        groupType: "and",
        filters: input.filters.map((filter) => ({
          dimension: filter.dimension,
          operator: filter.operator,
          expression: filter.expression,
        })),
      },
    ];
  }
  return body;
}

export async function listSites(client: GoogleClient): Promise<string> {
  const data = asRecord(await client.get(`${WEBMASTERS}/sites`));
  return formatSites(Array.isArray(data?.siteEntry) ? data.siteEntry : []);
}

export function formatSites(sites: unknown[]): string {
  if (sites.length === 0) {
    return "No Search Console properties were returned. The signed-in Google account needs access to a property, and the Search Console API must be enabled on the OAuth client's Google Cloud project.";
  }
  const lines = [`Search Console properties (${sites.length})`, ""];
  const rows = sites.map((site) => {
    const record = asRecord(site);
    return [
      stringField(record, "siteUrl") || "(missing siteUrl)",
      stringField(record, "permissionLevel") || "unknown",
    ];
  });
  lines.push(tsv(["siteUrl", "permission"], rows));
  lines.push(
    "",
    "Pass siteUrl exactly, including the trailing slash or the sc-domain: prefix.",
  );
  return lines.join("\n");
}

export async function searchAnalytics(
  client: GoogleClient,
  input: GscSearchAnalyticsInput,
): Promise<string> {
  const site = input.siteUrl.trim();
  const data = await client.post(
    `${WEBMASTERS}/sites/${encodeSiteUrl(site)}/searchAnalytics/query`,
    buildSearchAnalyticsBody(input),
  );
  return formatSearchAnalytics(site, input, data);
}

export function formatSearchAnalytics(
  siteUrl: string,
  input: GscSearchAnalyticsInput,
  payload: unknown,
): string {
  const record = asRecord(payload);
  const rows = Array.isArray(record?.rows) ? record.rows : [];
  const headers = [
    ...input.dimensions,
    "clicks",
    "impressions",
    "ctr",
    "position",
  ];
  const rendered = rows.map((row) => {
    const item = asRecord(row);
    const keys = Array.isArray(item?.keys)
      ? item.keys.map((key) => (typeof key === "string" ? key : ""))
      : [];
    const clicks = numberField(item, "clicks") ?? 0;
    const impressions = numberField(item, "impressions") ?? 0;
    const ctr = numberField(item, "ctr") ?? 0;
    const position = numberField(item, "position") ?? 0;
    return [
      ...pad(keys, input.dimensions.length),
      String(clicks),
      String(impressions),
      formatCtr(ctr),
      formatPosition(position),
    ];
  });
  const heading = `Search Console · ${siteUrl} · ${input.searchType} · ${input.startDate} to ${input.endDate} · ${rendered.length} row${rendered.length === 1 ? "" : "s"}`;
  if (rendered.length === 0) {
    return `${heading}\n\nThe query returned no rows. Confirm the siteUrl, date range, and that this Google account can read the property.`;
  }
  return `${heading}\n\n${tsv(headers, rendered)}`;
}

export async function inspectUrl(
  client: GoogleClient,
  input: GscInspectInput,
): Promise<string> {
  const data = await client.post(INSPECT, {
    inspectionUrl: input.inspectionUrl,
    siteUrl: input.siteUrl.trim(),
    languageCode: input.languageCode?.trim() || "en-US",
  });
  return formatInspection(input, data);
}

export function formatInspection(
  input: GscInspectInput,
  payload: unknown,
): string {
  const result = asRecord(asRecord(payload)?.inspectionResult);
  if (!result) return "URL inspection returned an empty result.";
  const index = asRecord(result.indexStatusResult);
  const mobile = asRecord(result.mobileUsabilityResult);
  const rich = asRecord(result.richResultsResult);
  const lines = [
    `URL inspection · ${input.inspectionUrl}`,
    `Property: ${input.siteUrl.trim()}`,
    "",
    `Verdict: ${stringField(index, "verdict") || "unknown"}`,
    `Coverage: ${stringField(index, "coverageState") || "unknown"}`,
    `Indexing: ${stringField(index, "indexingState") || "unknown"}`,
    `Robots.txt: ${stringField(index, "robotsTxtState") || "unknown"}`,
    `Page fetch: ${stringField(index, "pageFetchState") || "unknown"}`,
    `Last crawl: ${stringField(index, "lastCrawlTime") || "unknown"}`,
    `Crawled as: ${stringField(index, "crawledAs") || "unknown"}`,
    `Google canonical: ${stringField(index, "googleCanonical") || "none"}`,
    `User canonical: ${stringField(index, "userCanonical") || "none"}`,
    `Mobile usability: ${stringField(mobile, "verdict") || "not returned"}`,
    `Rich results: ${stringField(rich, "verdict") || "not returned"}`,
  ];
  const link = stringField(result, "inspectionResultLink");
  if (link) lines.push(`Search Console link: ${link}`);
  return lines.join("\n");
}

export async function listSitemaps(
  client: GoogleClient,
  input: GscSitemapsInput,
): Promise<string> {
  const url = new URL(
    `${WEBMASTERS}/sites/${encodeSiteUrl(input.siteUrl)}/sitemaps`,
  );
  if (input.sitemapIndex?.trim())
    url.searchParams.set("sitemapIndex", input.sitemapIndex.trim());
  const data = asRecord(await client.get(url.toString()));
  return formatSitemaps(
    input.siteUrl.trim(),
    Array.isArray(data?.sitemap) ? data.sitemap : [],
  );
}

export function formatSitemaps(siteUrl: string, sitemaps: unknown[]): string {
  if (sitemaps.length === 0) {
    return `No sitemaps are submitted for ${siteUrl}.`;
  }
  const rows = sitemaps.map((sitemap) => {
    const record = asRecord(sitemap);
    const kind = record?.isSitemapsIndex === true ? "index" : "sitemap";
    const errors = stringField(record, "errors") || "0";
    const warnings = stringField(record, "warnings") || "0";
    return [
      stringField(record, "path") || "(missing path)",
      kind,
      `errors=${errors}`,
      `warnings=${warnings}`,
      stringField(record, "lastDownloaded") || "never",
    ];
  });
  return `Sitemaps for ${siteUrl} (${sitemaps.length})\n\n${tsv(["path", "kind", "errors", "warnings", "lastDownloaded"], rows)}`;
}

export function registerSearchConsoleTools(
  server: McpServer,
  client: GoogleClient | null,
): void {
  server.registerTool(
    "gsc_list_sites",
    {
      title: "List Search Console properties",
      description:
        "List Search Console properties the signed-in user can access, with permission level. Copy siteUrl exactly into the other Search Console tools, including a trailing slash or the sc-domain: prefix. Read-only.",
      inputSchema: z.object({}),
      annotations: READ_ONLY,
    },
    async () => asToolResult(() => listSites(requireClient(client))),
  );

  server.registerTool(
    "gsc_search_analytics_query",
    {
      title: "Query Search Console performance",
      description:
        "Query Google Search performance for one Search Console property: clicks, impressions, CTR, and average position. Dimensions are query, page, country, device, date, and searchAppearance. Dates must be YYYY-MM-DD. searchType defaults to web and can be image, video, news, discover, or googleNews. This is Google Search traffic, not GA4 session traffic.",
      inputSchema: gscSearchAnalyticsSchema,
      annotations: READ_ONLY,
    },
    async (input) =>
      asToolResult(() => searchAnalytics(requireClient(client), input)),
  );

  server.registerTool(
    "gsc_inspect_url",
    {
      title: "Inspect a URL in Search Console",
      description:
        "Inspect one URL with the Search Console URL Inspection API. Returns the indexed version's coverage, indexing state, last crawl, canonicals, robots.txt state, and mobile/rich-result verdicts. inspectionUrl must belong to siteUrl. This reports the URL currently in Google's index, not a live test.",
      inputSchema: gscInspectSchema,
      annotations: READ_ONLY,
    },
    async (input) =>
      asToolResult(() => inspectUrl(requireClient(client), input)),
  );

  server.registerTool(
    "gsc_list_sitemaps",
    {
      title: "List Search Console sitemaps",
      description:
        "List sitemaps submitted for one Search Console property, including whether each is an index, error and warning counts, and the last download time. Pass sitemapIndex to list only the children of one sitemap index.",
      inputSchema: gscSitemapsSchema,
      annotations: READ_ONLY,
    },
    async (input) =>
      asToolResult(() => listSitemaps(requireClient(client), input)),
  );
}

function requireClient(client: GoogleClient | null): GoogleClient {
  if (!client) {
    throw new Error(
      "Google credentials are missing on this session. Disconnect the MCP server and sign in again.",
    );
  }
  return client;
}

function pad(values: string[], length: number): string[] {
  const next = values.slice(0, length);
  while (next.length < length) next.push("");
  return next;
}
