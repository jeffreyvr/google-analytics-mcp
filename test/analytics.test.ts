import { describe, expect, it } from "vitest";
import {
  buildRealtimeBody,
  buildRunReportBody,
  formatAccountSummaries,
  formatMetadata,
  formatReport,
  normalizePropertyId,
  runReport,
} from "../src/tools/analytics";
import { ga4RunReportSchema } from "../src/tools/schemas";

const reportInput = ga4RunReportSchema.parse({
  propertyId: "properties/123",
  dateRanges: [{ startDate: "7daysAgo", endDate: "today" }],
  dimensions: ["date", "country"],
  metrics: ["sessions"],
  filters: [
    { field: "country", operator: "exact", value: "United States" },
    { field: "sessions", operator: "gt", value: "10" },
  ],
  orderBys: [{ field: "sessions", desc: true }],
  limit: 25,
});

describe("GA4 input handling", () => {
  it("accepts a properties/ prefix and rejects a display name", () => {
    expect(normalizePropertyId(" properties/123456789 ")).toBe("123456789");
    expect(() => normalizePropertyId("My website")).toThrow(
      /Invalid GA4 property id/,
    );
  });

  it("defaults a report to the last 28 days", () => {
    const parsed = ga4RunReportSchema.parse({ propertyId: "1" });
    expect(parsed.dateRanges).toEqual([
      { startDate: "28daysAgo", endDate: "today" },
    ]);
    expect(parsed.metrics).toEqual(["sessions", "activeUsers"]);
    expect(parsed.limit).toBe(25);
  });

  it("rejects a relative date Google will not accept", () => {
    const parsed = ga4RunReportSchema.safeParse({
      propertyId: "1",
      dateRanges: [{ startDate: "last week", endDate: "today" }],
    });
    expect(parsed.success).toBe(false);
  });

  it("builds a Data API body with AND filters, ordering, and totals", () => {
    expect(buildRunReportBody(reportInput)).toEqual({
      dateRanges: [{ startDate: "7daysAgo", endDate: "today" }],
      dimensions: [{ name: "date" }, { name: "country" }],
      metrics: [{ name: "sessions" }],
      limit: "25",
      metricAggregations: ["TOTAL"],
      dimensionFilter: {
        andGroup: {
          expressions: [
            {
              filter: {
                fieldName: "country",
                stringFilter: {
                  matchType: "EXACT",
                  value: "United States",
                  caseSensitive: false,
                },
              },
            },
          ],
        },
      },
      metricFilter: {
        andGroup: {
          expressions: [
            {
              filter: {
                fieldName: "sessions",
                numericFilter: {
                  operation: "GREATER_THAN",
                  value: { int64Value: "10" },
                },
              },
            },
          ],
        },
      },
      orderBys: [{ desc: true, metric: { metricName: "sessions" } }],
    });
  });

  it("builds a realtime body without date ranges", () => {
    expect(
      buildRealtimeBody({
        propertyId: "5",
        dimensions: ["country"],
        metrics: ["activeUsers"],
        limit: 10,
      }),
    ).toEqual({
      dimensions: [{ name: "country" }],
      metrics: [{ name: "activeUsers" }],
      limit: "10",
    });
  });

  it("does not call Google when the property id is invalid", async () => {
    const client = {
      get: async () => {
        throw new Error("should not fetch");
      },
      post: async () => {
        throw new Error("should not fetch");
      },
    };
    await expect(
      runReport(client, { ...reportInput, propertyId: "not-an-id" }),
    ).rejects.toThrow(/Invalid GA4 property id/);
  });
});

describe("GA4 response formatting", () => {
  it("renders a compact table and totals", () => {
    const text = formatReport(
      "GA4 report · property 123",
      {
        dimensionHeaders: [{ name: "date" }],
        metricHeaders: [{ name: "sessions" }],
        rows: [
          {
            dimensionValues: [{ value: "2026-11-01" }],
            metricValues: [{ value: "12" }],
          },
        ],
        totals: [{ metricValues: [{ value: "12" }] }],
        rowCount: 1,
      },
      "7daysAgo to today",
    );
    expect(text).toContain(
      "GA4 report · property 123 · 7daysAgo to today · 1 row",
    );
    expect(text).toContain("date\tsessions");
    expect(text).toContain("2026-11-01\t12");
    expect(text).toContain("Totals: sessions=12");
  });

  it("says when a report is empty", () => {
    expect(
      formatReport(
        "GA4 report",
        { rows: [], rowCount: 0 },
        "yesterday to today",
      ),
    ).toContain("returned no rows");
  });

  it("lists accounts and property ids", () => {
    const text = formatAccountSummaries([
      {
        account: "accounts/10",
        displayName: "Northwind",
        propertySummaries: [
          {
            property: "properties/99",
            displayName: "Website",
            propertyType: "PROPERTY_TYPE_ORDINARY",
          },
        ],
      },
    ]);
    expect(text).toContain("Northwind (accounts/10)");
    expect(text).toContain("property id 99");
    expect(text).toContain("ga4_run_report");
  });

  it("searches metadata and falls back to an overview", () => {
    const payload = {
      dimensions: [
        { apiName: "date", uiName: "Date" },
        { apiName: "pagePath", uiName: "Page path" },
      ],
      metrics: [{ apiName: "sessions", uiName: "Sessions" }],
    };
    expect(formatMetadata("99", payload)).toContain("2 dimensions, 1 metric");
    expect(formatMetadata("99", payload)).toContain("pagePath");
    expect(formatMetadata("99", payload, "page")).toContain(
      "pagePath — Page path",
    );
    expect(formatMetadata("99", payload, "revenue")).toContain(
      "No GA4 dimensions or metrics",
    );
  });
});
