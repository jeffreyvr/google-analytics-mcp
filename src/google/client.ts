import type { GoogleProps } from "../auth/props";
import { explainGoogleError } from "./errors";
import { ensureFreshProps, type TokenSecrets } from "./oauth";

export class GoogleApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "GoogleApiError";
    this.status = status;
  }
}

export interface GoogleClient {
  get(url: string): Promise<unknown>;
  post(url: string, body: unknown): Promise<unknown>;
}

export function createGoogleClient(
  props: GoogleProps,
  env: TokenSecrets,
  fetcher: typeof fetch = fetch,
): GoogleClient {
  let current = props;

  async function request(
    method: "GET" | "POST",
    url: string,
    body?: unknown,
  ): Promise<unknown> {
    assertGoogleApiUrl(url);
    current = await ensureFreshProps(current, env, fetcher);
    let response = await callGoogle(
      fetcher,
      method,
      url,
      current.accessToken,
      body,
    );
    if (response.status === 401 && current.refreshToken) {
      current = await ensureFreshProps(
        { ...current, expiresAt: 0 },
        env,
        fetcher,
      );
      response = await callGoogle(
        fetcher,
        method,
        url,
        current.accessToken,
        body,
      );
    }
    const text = await response.text();
    const parsed = parseJson(text);
    if (!response.ok) {
      throw new GoogleApiError(
        explainGoogleError(response.status, parsed, url),
        response.status,
      );
    }
    return parsed;
  }

  return {
    get: (url) => request("GET", url),
    post: (url, body) => request("POST", url, body),
  };
}

async function callGoogle(
  fetcher: typeof fetch,
  method: "GET" | "POST",
  url: string,
  accessToken: string,
  body: unknown,
): Promise<Response> {
  try {
    return await fetcher(url, {
      method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new GoogleApiError(
      `Could not reach Google at ${safeEndpoint(url)}.`,
      503,
    );
  }
}

function parseJson(text: string): unknown {
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { error: { message: text.slice(0, 500) } };
  }
}

export function assertGoogleApiUrl(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new GoogleApiError(
      "Refusing a Google API request with an invalid URL.",
      400,
    );
  }
  const host = parsed.hostname;
  const googleHost =
    host === "googleapis.com" || host.endsWith(".googleapis.com");
  if (
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    !googleHost
  ) {
    throw new GoogleApiError(
      "Refusing to send the Google access token to a non-Google host.",
      400,
    );
  }
}

function safeEndpoint(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return "the Google API";
  }
}
