import { z } from "zod";

export const ga4DateSchema = z
  .string()
  .regex(
    /^(\d{4}-\d{2}-\d{2}|today|yesterday|\d+daysAgo)$/,
    "Use YYYY-MM-DD, today, yesterday, or NdaysAgo (for example 7daysAgo)",
  );

export const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");

const ga4FilterSchema = z.object({
  field: z
    .string()
    .min(1)
    .describe("Dimension or metric API name, for example country or sessions"),
  operator: z
    .enum([
      "exact",
      "contains",
      "begins_with",
      "ends_with",
      "regex",
      "gt",
      "lt",
      "eq",
    ])
    .describe(
      "String operators filter dimensions. gt, lt, and eq filter metrics.",
    ),
  value: z
    .string()
    .describe(
      "Comparison value. For gt, lt, and eq, pass the number as a string.",
    ),
});

const ga4OrderSchema = z.object({
  field: z.string().min(1).describe("Dimension or metric API name to sort by"),
  desc: z
    .boolean()
    .optional()
    .describe("Sort descending. Defaults to ascending."),
  kind: z
    .enum(["dimension", "metric"])
    .optional()
    .describe(
      "Defaults to metric when the field is one of the requested metrics.",
    ),
});

export const ga4RunReportSchema = z.object({
  propertyId: z
    .string()
    .min(1)
    .describe(
      "Numeric GA4 property id from ga4_list_properties. properties/123456789 is also accepted.",
    ),
  dateRanges: z
    .array(
      z.object({
        startDate: ga4DateSchema,
        endDate: ga4DateSchema,
      }),
    )
    .min(1)
    .max(2)
    .default([{ startDate: "28daysAgo", endDate: "today" }])
    .describe(
      "One range, or two to compare periods. Defaults to the last 28 days.",
    ),
  dimensions: z
    .array(z.string().min(1))
    .max(9)
    .default([])
    .describe(
      "Dimension API names such as date, sessionDefaultChannelGroup, country, pagePath, eventName. Omit for a totals-only report.",
    ),
  metrics: z
    .array(z.string().min(1))
    .min(1)
    .max(10)
    .default(["sessions", "activeUsers"])
    .describe(
      "Metric API names such as sessions, activeUsers, screenPageViews, conversions, totalRevenue.",
    ),
  filters: z
    .array(ga4FilterSchema)
    .max(8)
    .optional()
    .describe("Combined with AND."),
  orderBys: z.array(ga4OrderSchema).max(4).optional(),
  limit: z
    .number()
    .int()
    .min(1)
    .max(250)
    .default(25)
    .describe("Maximum rows to return. Defaults to 25."),
  offset: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe("Number of rows to skip."),
});

export const ga4RealtimeSchema = z.object({
  propertyId: z
    .string()
    .min(1)
    .describe("Numeric GA4 property id from ga4_list_properties."),
  dimensions: z
    .array(z.string().min(1))
    .max(4)
    .default([])
    .describe(
      "Realtime dimensions such as country, city, deviceCategory, unifiedScreenName, minutesAgo.",
    ),
  metrics: z
    .array(z.string().min(1))
    .min(1)
    .max(8)
    .default(["activeUsers"])
    .describe(
      "Realtime metrics such as activeUsers, screenPageViews, eventCount.",
    ),
  limit: z.number().int().min(1).max(100).default(25),
});

export const ga4MetadataSchema = z.object({
  propertyId: z
    .string()
    .min(1)
    .describe("Numeric GA4 property id from ga4_list_properties."),
  query: z
    .string()
    .optional()
    .describe(
      "Case-insensitive substring matched against API names and UI names, for example page, revenue, or session. Omit for a short overview.",
    ),
});

export const gscDimensionSchema = z.enum([
  "query",
  "page",
  "country",
  "device",
  "date",
  "searchAppearance",
]);

export const gscSearchAnalyticsSchema = z.object({
  siteUrl: z
    .string()
    .min(1)
    .describe(
      "Exact property URL from gsc_list_sites, including a trailing slash or the sc-domain: prefix.",
    ),
  startDate: isoDateSchema.describe(
    "YYYY-MM-DD. Search Console does not accept relative dates.",
  ),
  endDate: isoDateSchema.describe("YYYY-MM-DD."),
  dimensions: z
    .array(gscDimensionSchema)
    .max(6)
    .default([])
    .describe(
      "Group by query, page, country, device, date, and/or searchAppearance. Omit for a site total.",
    ),
  searchType: z
    .enum(["web", "image", "video", "news", "discover", "googleNews"])
    .default("web")
    .describe("Search type. Defaults to web."),
  filters: z
    .array(
      z.object({
        dimension: z.enum([
          "query",
          "page",
          "country",
          "device",
          "searchAppearance",
        ]),
        operator: z.enum([
          "contains",
          "equals",
          "notContains",
          "notEquals",
          "includingRegex",
          "excludingRegex",
        ]),
        expression: z.string().min(1),
      }),
    )
    .max(8)
    .optional()
    .describe("Combined with AND."),
  rowLimit: z.number().int().min(1).max(500).default(25),
  startRow: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe("Zero-based row offset."),
  dataState: z
    .enum(["final", "all"])
    .optional()
    .describe(
      "final excludes fresh data still being processed. all includes it.",
    ),
});

export const gscInspectSchema = z.object({
  siteUrl: z
    .string()
    .min(1)
    .describe("Exact property URL from gsc_list_sites."),
  inspectionUrl: z
    .url()
    .describe("Fully qualified URL to inspect. It must belong to siteUrl."),
  languageCode: z
    .string()
    .optional()
    .describe(
      "BCP-47 language for issue messages, for example en-US. Defaults to en-US.",
    ),
});

export const gscSitemapsSchema = z.object({
  siteUrl: z
    .string()
    .min(1)
    .describe("Exact property URL from gsc_list_sites."),
  sitemapIndex: z
    .string()
    .optional()
    .describe(
      "If set, list only the child sitemaps of this sitemap index URL.",
    ),
});

export type Ga4RunReportInput = z.infer<typeof ga4RunReportSchema>;
export type Ga4RealtimeInput = z.infer<typeof ga4RealtimeSchema>;
export type Ga4MetadataInput = z.infer<typeof ga4MetadataSchema>;
export type GscSearchAnalyticsInput = z.infer<typeof gscSearchAnalyticsSchema>;
export type GscInspectInput = z.infer<typeof gscInspectSchema>;
export type GscSitemapsInput = z.infer<typeof gscSitemapsSchema>;
