import type { IncomingMessage, ServerResponse } from "node:http";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { authenticateToken, issuerUrl } from "../lib/mcp-auth.js";
import { handleMcpOAuth } from "../lib/mcp-oauth.js";
import { createCrmMcpServer } from "../lib/mcp-tools.js";

export const config = { api: { bodyParser: false } };

export default async function handler(
  req: IncomingMessage,
  res: ServerResponse,
) {
  const path = new URL(req.url || "/", issuerUrl() || "https://local.invalid")
    .pathname;
  try {
    if (path !== "/api/mcp") {
      await handleMcpOAuth(req, res, path);
      return;
    }
    if (
      !(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY) ||
      !process.env.DATABASE_URL ||
      !process.env.MCP_ALLOWED_EMAILS ||
      !process.env.MCP_PUBLIC_URL
    ) {
      res.statusCode = 503;
      res.end("MCP server is not configured");
      return;
    }
    const header = Array.isArray(req.headers.authorization)
      ? req.headers.authorization[0]
      : req.headers.authorization;
    const who = await authenticateToken(header);
    if (!who) {
      res.statusCode = 401;
      res.setHeader(
        "WWW-Authenticate",
        `Bearer resource_metadata="${issuerUrl()}/.well-known/oauth-protected-resource"`,
      );
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ error: "Unauthorized" }));
      return;
    }
    const server: McpServer = createCrmMcpServer(who);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });
    res.on("close", () => {
      void server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(req, res);
  } catch (e) {
    if (res.headersSent) return;
    res.statusCode = (e as { status?: number }).status || 500;
    res.setHeader("content-type", "application/json");
    res.end(
      JSON.stringify({
        error:
          res.statusCode === 500 ? "MCP request failed" : (e as Error).message,
      }),
    );
  }
}
