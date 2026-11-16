type GoogleErrorBody = {
  message: string;
  reason: string;
  status: string;
};

export function explainGoogleError(
  status: number,
  body: unknown,
  endpoint: string,
): string {
  const parsed = parseGoogleError(body);
  const blob =
    `${parsed.message} ${parsed.reason} ${parsed.status}`.toLowerCase();
  const api = apiNameFromEndpoint(endpoint);

  if (status === 401) {
    return "Google rejected the access token (401). Disconnect the MCP server and sign in again.";
  }

  if (
    status === 429 ||
    parsed.reason === "rateLimitExceeded" ||
    parsed.reason === "quotaExceeded" ||
    blob.includes("quota")
  ) {
    return `Google quota exceeded for ${api} (${status}). Wait and retry, or raise the quota in the same Google Cloud project as the OAuth client. ${parsed.message}`.trim();
  }

  if (
    status === 403 &&
    (blob.includes("has not been used") ||
      blob.includes("is disabled") ||
      blob.includes("accessnotconfigured") ||
      blob.includes("service_disabled") ||
      parsed.reason === "accessNotConfigured" ||
      parsed.reason === "SERVICE_DISABLED")
  ) {
    return `${api} is not enabled on the Google Cloud project that owns this OAuth client. Enable it from the setup page, wait a minute, and retry. Google said: ${parsed.message || "API disabled"}`;
  }

  if (status === 403 || status === 404) {
    return `The signed-in Google account cannot access this property (${status}). Confirm that account is a user of the GA4 property or Search Console property. Google said: ${parsed.message || "permission denied"}`;
  }

  if (status === 400) {
    return `Google rejected the request (400). ${parsed.message || "Invalid argument."} Check dimension and metric API names with ga4_get_metadata, date formats, and that siteUrl matches gsc_list_sites exactly.`;
  }

  return `Google API request failed (${status}) for ${api}. ${parsed.message || "No error message was returned."}`;
}

export function apiNameFromEndpoint(endpoint: string): string {
  if (endpoint.includes("analyticsdata.googleapis.com"))
    return "the Google Analytics Data API";
  if (endpoint.includes("analyticsadmin.googleapis.com"))
    return "the Google Analytics Admin API";
  if (
    endpoint.includes("searchconsole.googleapis.com") ||
    endpoint.includes("webmasters")
  )
    return "the Google Search Console API";
  return "the Google API";
}

function parseGoogleError(body: unknown): GoogleErrorBody {
  const record = asRecord(body);
  const error = asRecord(record?.error) ?? record;
  const message =
    stringValue(error?.message) ||
    stringValue(error?.error_description) ||
    stringValue(record?.error_description);
  const status = stringValue(error?.status);
  const errors = Array.isArray(error?.errors) ? error.errors : [];
  const first = asRecord(errors[0]);
  const details = Array.isArray(error?.details) ? error.details : [];
  const detail = asRecord(details[0]);
  const reason =
    stringValue(first?.reason) ||
    stringValue(detail?.reason) ||
    stringValue(error?.error);
  return { message, reason, status };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}
