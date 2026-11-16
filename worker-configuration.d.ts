/// <reference types="@cloudflare/workers-types" />

interface __BaseEnv_Env {
  OAUTH_KV: KVNamespace;
  HOSTED_DOMAIN: string;
  MCP_RESOURCE: string;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
}
declare namespace Cloudflare {
  interface Env extends __BaseEnv_Env {}
}
interface Env extends __BaseEnv_Env {}
