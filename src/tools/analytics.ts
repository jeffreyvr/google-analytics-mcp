import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import type { GoogleClient } from "../google/client";
import { asRecord, formatCount, stringField, tsv } from "./format";
import { asToolResult } from "./result";
import {
  type Ga4RealtimeInput,
  type Ga4RunReportInput,
  ga4MetadataSchema,
  ga4RealtimeSchema,
  ga4RunReportSchema,
} from "./schemas";

const ADMIN = "https://analyticsadmin.googleapis.com/v1beta";
const DATA = "https://analyticsdata.googleapis.com/v1beta";

const COMMON_DIMENSIONS = [
  "date",
  "sessionDefaultChannelGroup",
  "country",
  "deviceCategory",
  "pagePath",
  "landingPagePlusQueryString",
  "sessionSource",
  "sessionMedium",
  "eventName",
  "city",
];

const COMMON_METRICS = [
  "sessions",
  "activeUsers",
  "newUsers",
  "screenPageViews",
  "engagementRate",
  "bounceRate",
  "averageSessionDuration",
  "eventCount",
  "conversions",
  "totalRevenue",
];

const READ_ONLY = {
  readOnlyHint: true,
  destructiveHint: false,
  openWorldHint: true,
} as const;

const STRING_MATCH = {
  exact: "EXACT",
  contains: "CONTAINS",
  begins_with: "BEGINS_WITH",
  ends_with: "ENDS_WITH",
  regex: "PARTIAL_REGEXP",
} as const;

const NUMERIC_MATCH = {
  gt: "GREATER_THAN",
  lt: "LESS_THAN",
  eq: "EQUAL",
} as const;

export function normalizePropertyId(propertyId: string): string {
  const trimmed = propertyId.trim();
  const id = trimmed.startsWith("properties/")
    ? trimmed.slice("properties/".length)
    : trimmed;
  if (!/^\d+$/.test(id)) {
    throw new Error(
      `Invalid GA4 property id "${propertyId}". Use the numeric id from ga4_list_properties, for example 123456789 or properties/123456789.`,
    );
  }
  return id;
}

export function buildRunReportBody(
  input: Ga4RunReportInput,
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    dateRanges: input.dateRanges,
    metrics: input.metrics.map((name) => ({ name })),
    limit: String(input.limit),
    metricAggregations: ["TOTAL"],
  };
  if (input.dimensions.length > 0)
    body.dimensions = input.dimensions.map((name) => ({ name }));
  if (input.offset) body.offset = String(input.offset);
  const filters = splitFilters(input);
  if (filters.dimensionFilter) body.dimensionFilter = filters.dimensionFilter;
  if (filters.metricFilter) body.metricFilter = filters.metricFilter;
  const orderBys = buildOrderBys(input);
  if (orderBys.length > 0) body.orderBys = orderBys;
  return body;
}

export function buildRealtimeBody(
  input: Ga4RealtimeInput,
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    metrics: input.metrics.map((name) => ({ name })),
    limit: String(input.limit),
  };
  if (input.dimensions.length > 0)
    body.dimensions = input.dimensions.map((name) => ({ name }));
  return body;
}

export async function listProperties(client: GoogleClient): Promise<string> {
  const summaries = [];
  let pageToken = "";
  let truncated = false;
  for (let page = 0; page < 10; page++) {
    const url = new URL(`${ADMIN}/accountSummaries`);
    url.searchParams.set("pageSize", "200");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const data = asRecord(await client.get(url.toString()));
    const batch = Array.isArray(data?.accountSummaries)
      ? data.accountSummaries
      : [];
    summaries.push(...batch);
    pageToken = stringField(data, "nextPageToken");
    if (!pageToken) break;
    if (page === 9) truncated = true;
  }
  return formatAccountSummaries(summaries, truncated);
}

export function formatAccountSummaries(
  summaries: unknown[],
  truncated = false,
): string {
  if (summaries.length === 0) {
    return "No GA4 accounts were returned. The signed-in Google account needs at least Viewer access on a property, and the Analytics Admin API must be enabled on the OAuth client's Google Cloud project.";
  }
  const lines = [
    `GA4 accounts and properties (${summaries.length} account${summaries.length === 1 ? "" : "s"})`,
    "",
  ];
  for (const summary of summaries) {
    const record = asRecord(summary);
    const account =
      stringField(record, "account") || stringField(record, "name");
    const name =
      stringField(record, "displayName") || account || "Untitled account";
    lines.push(`${name} (${account || "unknown account"})`);
    const properties = Array.isArray(record?.propertySummaries)
      ? record.propertySummaries
      : [];
    if (properties.length === 0) {
      lines.push("  No properties visible on this account.");
      continue;
    }
    for (const property of properties) {
      const item = asRecord(property);
      const propertyName = stringField(item, "property");
      const id = propertyName.startsWith("properties/")
        ? propertyName.slice("properties/".length)
        : propertyName;
      const label =
        stringField(item, "displayName") || propertyName || "Untitled property";
      const type = stringField(item, "propertyType")
        .replace("PROPERTY_TYPE_", "")
        .toLowerCase();
      lines.push(
        `  - ${label} — property id ${id || "unknown"}${type ? ` (${type})` : ""}`,
      );
    }
  }
  lines.push(
    "",
    "Pass the numeric property id to ga4_run_report, ga4_run_realtime_report, and ga4_get_metadata.",
  );
  if (truncated)
    lines.push(
      "The list stopped after 10 pages. Narrow access if an account is missing.",
    );
  return lines.join("\n");
}

export async function runReport(
  client: GoogleClient,
  input: Ga4RunReportInput,
): Promise<string> {
  const id = normalizePropertyId(input.propertyId);
  const data = await client.post(
    `${DATA}/properties/${id}:runReport`,
    buildRunReportBody(input),
  );
  return formatReport(
    `GA4 report · property ${id}`,
    data,
    input.dateRanges
      .map((range) => `${range.startDate} to ${range.endDate}`)
      .join("; "),
  );
}

export async function runRealtimeReport(
  client: GoogleClient,
  input: Ga4RealtimeInput,
): Promise<string> {
  const id = normalizePropertyId(input.propertyId);
  const data = await client.post(
    `${DATA}/properties/${id}:runRealtimeReport`,
    buildRealtimeBody(input),
  );
  return formatReport(
    `GA4 realtime · property ${id} · last 30 minutes`,
    data,
    "",
  );
}

export async function getMetadata(
  client: GoogleClient,
  propertyId: string,
  query?: string,
): Promise<string> {
  const id = normalizePropertyId(propertyId);
  const data = await client.get(`${DATA}/properties/${id}/metadata`);
  return formatMetadata(id, data, query);
}

export function formatReport(
  title: string,
  payload: unknown,
  rangeLabel: string,
): string {
  const record = asRecord(payload);
  const dimensions = headerNames(record?.dimensionHeaders);
  const metrics = headerNames(record?.metricHeaders);
  const headers = [...dimensions, ...metrics];
  const rows = arrayOf(record?.rows).map((row) => {
    const item = asRecord(row);
    return [...values(item?.dimensionValues), ...values(item?.metricValues)];
  });
  const rowCount =
    typeof record?.rowCount === "number" ? record.rowCount : rows.length;
  const heading = [title, rangeLabel].filter(Boolean).join(" · ");
  if (rows.length === 0) {
    return `${heading}\n\nThe report returned no rows for this date range and filter.`;
  }
  const shown =
    rowCount > rows.length
      ? `${rows.length} of ${rowCount} rows`
      : `${rows.length} row${rows.length === 1 ? "" : "s"}`;
  const parts = [`${heading} · ${shown}`, "", tsv(headers, rows)];
  const totals = arrayOf(record?.totals);
  if (totals.length > 0 && metrics.length > 0) {
    const totalValues = values(asRecord(totals[0])?.metricValues);
    const pairs = metrics.map(
      (name, index) => `${name}=${totalValues[index] ?? ""}`,
    );
    parts.push("", `Totals: ${pairs.join(", ")}`);
  }
  if (rowCount > rows.length)
    parts.push("", "Raise limit or pass offset to read more rows.");
  return parts.join("\n");
}

export function formatMetadata(
  propertyId: string,
  payload: unknown,
  query?: string,
): string {
  const record = asRecord(payload);
  const dimensions = arrayOf(record?.dimensions)
    .map(metadataItem)
    .filter((item) => item.apiName);
  const metrics = arrayOf(record?.metrics)
    .map(metadataItem)
    .filter((item) => item.apiName);
  const needle = query?.trim().toLowerCase() ?? "";
  if (!needle) {
    const dimensionNames = new Set(dimensions.map((item) => item.apiName));
    const metricNames = new Set(metrics.map((item) => item.apiName));
    const commonDimensions = COMMON_DIMENSIONS.filter((name) =>
      dimensionNames.has(name),
    );
    const commonMetrics = COMMON_METRICS.filter((name) =>
      metricNames.has(name),
    );
    return [
      `GA4 metadata · property ${propertyId} · ${formatCount(dimensions.length, "dimension")}, ${formatCount(metrics.length, "metric")}`,
      "Pass query to search API names (for example page, revenue, or session).",
      "",
      `Common dimensions: ${commonDimensions.join(", ") || "none of the usual names are on this property"}`,
      `Common metrics: ${commonMetrics.join(", ") || "none of the usual names are on this property"}`,
    ].join("\n");
  }
  const matchedDimensions = dimensions
    .filter((item) => matches(item, needle))
    .slice(0, 40);
  const matchedMetrics = metrics
    .filter((item) => matches(item, needle))
    .slice(0, 40);
  if (matchedDimensions.length === 0 && matchedMetrics.length === 0) {
    return `No GA4 dimensions or metrics on property ${propertyId} match "${query}". Try a shorter word, or call ga4_get_metadata without query for the common names.`;
  }
  const lines = [
    `GA4 metadata matches for "${query}" on property ${propertyId}`,
    "",
  ];
  if (matchedDimensions.length > 0) {
    lines.push("Dimensions");
    for (const item of matchedDimensions)
      lines.push(`- ${item.apiName} — ${item.uiName}`);
    lines.push("");
  }
  if (matchedMetrics.length > 0) {
    lines.push("Metrics");
    for (const item of matchedMetrics)
      lines.push(`- ${item.apiName} — ${item.uiName}`);
  }
  return lines.join("\n").trimEnd();
}

export function registerAnalyticsTools(
  server: McpServer,
  client: GoogleClient | null,
): void {
  server.registerTool(
    "ga4_list_properties",
    {
      title: "List GA4 accounts and properties",
      description:
        "List the Google Analytics 4 accounts and properties the signed-in user can access. Call this before any report so you use a real numeric property id. Returns account display names and property ids. Read-only.",
      inputSchema: z.object({}),
      annotations: READ_ONLY,
    },
    async () => asToolResult(() => listProperties(requireClient(client))),
  );

  server.registerTool(
    "ga4_run_report",
    {
      title: "Run a GA4 report",
      description:
        "Run a Google Analytics 4 historical report for one property. Use it for sessions, users, page views, events, conversions, and revenue by date, channel, page, country, device, or source. Do not use it for traffic in the last 30 minutes (ga4_run_realtime_report) or for Google Search queries (gsc_search_analytics_query). Dates are YYYY-MM-DD or relative tokens today, yesterday, and NdaysAgo. If Google rejects a field name, call ga4_get_metadata.",
      inputSchema: ga4RunReportSchema,
      annotations: READ_ONLY,
    },
    async (input) =>
      asToolResult(() => runReport(requireClient(client), input)),
  );

  server.registerTool(
    "ga4_run_realtime_report",
    {
      title: "Run a GA4 realtime report",
      description:
        "Run a Google Analytics 4 realtime report (about the last 30 minutes) for one property. Typical dimensions: country, deviceCategory, unifiedScreenName, minutesAgo. Typical metric: activeUsers. For any earlier date range, use ga4_run_report.",
      inputSchema: ga4RealtimeSchema,
      annotations: READ_ONLY,
    },
    async (input) =>
      asToolResult(() => runRealtimeReport(requireClient(client), input)),
  );

  server.registerTool(
    "ga4_get_metadata",
    {
      title: "List GA4 dimensions and metrics",
      description:
        "List dimensions and metrics available on one GA4 property. Omit query for counts and common names. Pass query (for example page, revenue, session) to search API names before retrying a report that Google rejected.",
      inputSchema: ga4MetadataSchema,
      annotations: READ_ONLY,
    },
    async (input) =>
      asToolResult(() =>
        getMetadata(requireClient(client), input.propertyId, input.query),
      ),
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

function splitFilters(input: Ga4RunReportInput): {
  dimensionFilter?: unknown;
  metricFilter?: unknown;
} {
  const dimension = [];
  const metric = [];
  for (const filter of input.filters ?? []) {
    if (
      filter.operator === "gt" ||
      filter.operator === "lt" ||
      filter.operator === "eq"
    ) {
      metric.push({
        filter: {
          fieldName: filter.field,
          numericFilter: {
            operation: NUMERIC_MATCH[filter.operator],
            value: numericValue(filter.value),
          },
        },
      });
    } else {
      dimension.push({
        filter: {
          fieldName: filter.field,
          stringFilter: {
            matchType: STRING_MATCH[filter.operator],
            value: filter.value,
            caseSensitive: false,
          },
        },
      });
    }
  }
  return {
    dimensionFilter:
      dimension.length > 0
        ? { andGroup: { expressions: dimension } }
        : undefined,
    metricFilter:
      metric.length > 0 ? { andGroup: { expressions: metric } } : undefined,
  };
}

function numericValue(value: string): Record<string, string | number> {
  if (value.includes(".")) return { doubleValue: Number(value) };
  return { int64Value: value };
}

function buildOrderBys(input: Ga4RunReportInput): Record<string, unknown>[] {
  const metrics = new Set(input.metrics);
  return (input.orderBys ?? []).map((order) => {
    const kind =
      order.kind ?? (metrics.has(order.field) ? "metric" : "dimension");
    if (kind === "metric") {
      return { desc: order.desc ?? false, metric: { metricName: order.field } };
    }
    return {
      desc: order.desc ?? false,
      dimension: { dimensionName: order.field, orderType: "ALPHANUMERIC" },
    };
  });
}

function headerNames(value: unknown): string[] {
  return arrayOf(value)
    .map((header) => stringField(asRecord(header), "name"))
    .filter(Boolean);
}

function values(value: unknown): string[] {
  return arrayOf(value).map((entry) => stringField(asRecord(entry), "value"));
}

function arrayOf(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function metadataItem(value: unknown): { apiName: string; uiName: string } {
  const record = asRecord(value);
  return {
    apiName: stringField(record, "apiName"),
    uiName: stringField(record, "uiName") || stringField(record, "apiName"),
  };
}

function matches(
  item: { apiName: string; uiName: string },
  needle: string,
): boolean {
  return (
    item.apiName.toLowerCase().includes(needle) ||
    item.uiName.toLowerCase().includes(needle)
  );
}
