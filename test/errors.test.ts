import { describe, expect, it } from "vitest";
import { explainGoogleError } from "../src/google/errors";

describe("Google API errors", () => {
  it("explains a disabled API", () => {
    const message = explainGoogleError(
      403,
      {
        error: {
          code: 403,
          message:
            "Google Analytics Data API has not been used in project 123 before or it is disabled.",
          status: "PERMISSION_DENIED",
          details: [{ reason: "SERVICE_DISABLED" }],
        },
      },
      "https://analyticsdata.googleapis.com/v1beta/properties/1:runReport",
    );
    expect(message).toContain("Analytics Data API");
    expect(message).toContain("not enabled");
  });

  it("explains a missing property permission", () => {
    const message = explainGoogleError(
      403,
      {
        error: {
          code: 403,
          message:
            "User does not have sufficient permissions for this property.",
          status: "PERMISSION_DENIED",
        },
      },
      "https://analyticsadmin.googleapis.com/v1beta/accountSummaries",
    );
    expect(message).toContain("cannot access this property");
    expect(message).toContain("sufficient permissions");
  });

  it("keeps Google's invalid-argument detail", () => {
    const message = explainGoogleError(
      400,
      {
        error: {
          code: 400,
          message: "Did you mean sessionDefaultChannelGroup?",
          status: "INVALID_ARGUMENT",
        },
      },
      "https://analyticsdata.googleapis.com/v1beta/properties/1:runReport",
    );
    expect(message).toContain("Did you mean sessionDefaultChannelGroup?");
    expect(message).toContain("ga4_get_metadata");
  });

  it("explains quota separately from permission", () => {
    const message = explainGoogleError(
      429,
      {
        error: {
          code: 429,
          message: "Quota exceeded",
          errors: [{ reason: "rateLimitExceeded" }],
        },
      },
      "https://www.googleapis.com/webmasters/v3/sites",
    );
    expect(message).toContain("quota exceeded");
    expect(message).toContain("Search Console API");
  });
});
