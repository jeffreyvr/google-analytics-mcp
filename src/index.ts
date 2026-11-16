import {
  GrantType,
  OAuthError,
  OAuthProvider,
} from "@cloudflare/workers-oauth-provider";
import { createMcpHandler } from "agents/mcp/server";
import { handleAuthRequest } from "./auth/handler";
import { isGoogleProps } from "./auth/props";
import { MCP_SCOPES } from "./auth/scopes";
import { ensureFreshProps, GoogleOAuthError } from "./google/oauth";
import { present } from "./html";
import { createAnalyticsMcpServer } from "./mcp/server";
import { resolveResource } from "./resource";

const mcpHandler = createMcpHandler(createAnalyticsMcpServer);

export default {
  async fetch(request, env, ctx): Promise<Response> {
    const { resource, issuer } = resolveResource(
      request,
      present(env.MCP_RESOURCE),
    );
    const provider = new OAuthProvider<Env>({
      apiRoute: "/mcp",
      apiHandler: {
        fetch(apiRequest, apiEnv, apiCtx) {
          return mcpHandler(apiRequest, apiEnv, apiCtx);
        },
      },
      defaultHandler: {
        fetch: handleAuthRequest,
      },
      authorizeEndpoint: "/authorize",
      tokenEndpoint: "/token",
      clientRegistrationEndpoint: "/register",
      scopesSupported: [...MCP_SCOPES],
      requiredScopes: [...MCP_SCOPES],
      resourceMetadata: {
        resource,
        authorization_servers: [issuer],
        resource_name: "google-analytics-mcp",
      },
      clientIdMetadataDocumentEnabled: true,
      allowPrivateUseRedirectUris: true,
      tokenExchangeCallback: async (options) => {
        if (options.grantType !== GrantType.REFRESH_TOKEN) return;
        if (!isGoogleProps(options.props)) {
          throw new OAuthError("invalid_grant", {
            description: "This grant has no Google credentials. Sign in again.",
          });
        }
        try {
          const fresh = await ensureFreshProps(
            { ...options.props, expiresAt: 0 },
            options.env,
          );
          const expiresIn = Math.max(
            60,
            Math.floor((fresh.expiresAt - Date.now()) / 1000),
          );
          return { newProps: fresh, accessTokenTTL: expiresIn };
        } catch (error) {
          if (
            error instanceof GoogleOAuthError &&
            error.code === "invalid_grant"
          ) {
            throw new OAuthError("invalid_grant", {
              description: error.message,
            });
          }
          if (
            error instanceof GoogleOAuthError &&
            (error.code === "temporarily_unavailable" ||
              error.code === "token_exchange_failed")
          ) {
            throw new OAuthError("temporarily_unavailable", {
              description: error.message,
              statusCode: 503,
            });
          }
          throw error;
        }
      },
      onError: ({ code, status }) => {
        console.error(JSON.stringify({ source: "oauth", code, status }));
      },
    });
    return provider.fetch(request, env, ctx);
  },
} satisfies ExportedHandler<Env>;
