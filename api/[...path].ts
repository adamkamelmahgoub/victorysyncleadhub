import type { IncomingMessage, ServerResponse } from "node:http";

let appPromise: Promise<
  (req: IncomingMessage, res: ServerResponse) => void
> | null = null;

async function loadApp() {
  appPromise ??= import("../artifacts/api-server/src/app.js").then(
    (mod) => mod.default as (req: IncomingMessage, res: ServerResponse) => void,
  );
  return appPromise;
}

export default async function handler(
  req: IncomingMessage,
  res: ServerResponse,
) {
  try {
    const app = await loadApp();
    app(req, res);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("API failed to start", error);
    res.statusCode = 500;
    res.setHeader("content-type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ error: "API failed to start", message }));
  }
}
