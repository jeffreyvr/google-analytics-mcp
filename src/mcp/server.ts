import { env } from "cloudflare:workers";
import { McpServer } from "@modelcontextprotocol/server";
import { getMcpAuthContext } from "agents/mcp/server";
import { isGoogleProps } from "../auth/props";
import { createGoogleClient } from "../google/client";
import { registerAnalyticsTools } from "../tools/analytics";
import { textResult } from "../tools/result";
import { registerSearchConsoleTools } from "../tools/search-console";

export function createAnalyticsMcpServer(): McpServer {
  const server = new McpServer({
    name: "google-analytics-mcp",
    version: "1.0.0",
  });
  const rawProps = getMcpAuthContext()?.props;
  const props = isGoogleProps(rawProps) ? rawProps : null;
  const client = props
    ? createGoogleClient(props, {
        GOOGLE_CLIENT_ID: env.GOOGLE_CLIENT_ID,
        GOOGLE_CLIENT_SECRET: env.GOOGLE_CLIENT_SECRET,
      })
    : null;

  registerAnalyticsTools(server, client);
  registerSearchConsoleTools(server, client);

  server.registerTool(
    "whoami",
    {
      title: "Show the signed-in Google account",
      description:
        "Return the Google account email this MCP session is using for Analytics and Search Console. Does not return tokens.",
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      },
    },
    async () => {
      if (!props) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: "No Google account is attached to this session. Disconnect the MCP server and sign in again.",
            },
          ],
        };
      }
      return textResult(
        `Signed in to Google as ${props.name} <${props.email}>.`,
      );
    },
  );

  return server;
}
