import type { IncomingMessage, ServerResponse } from "node:http";
import { edgeCall } from "../lib/enrichment-client.js";

export const config = { maxDuration: 300 };
export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (req.method !== "POST" || !process.env.OUTREACH_WORKER_TOKEN ||
      req.headers.authorization !== `Bearer ${process.env.OUTREACH_WORKER_TOKEN}`) {
    res.statusCode = 401; res.end("Unauthorized"); return;
  }
  try {
    const result = await edgeCall("enrichment-worker", {});
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(result));
  } catch (error) {
    res.statusCode = 500;
    res.end(JSON.stringify({ error: (error as Error).message }));
  }
}
