import type { NextFunction, Request, Response } from "express";
import { db } from "@workspace/db";
import { apiKeysTable } from "@workspace/db/schema";
import { eq, sql } from "drizzle-orm";
import crypto from "crypto";
import { isSupabaseConfigured, supabase } from "../lib/supabase.js";

const publicApiPaths = [
  "/healthz",
  "/oauth",
  "/auth/signup-with-invite",
];

function isPublicPath(path: string) {
  return publicApiPaths.some((publicPath) =>
    path === publicPath || path.startsWith(`${publicPath}/`),
  );
}

function getBearerToken(req: Request) {
  const authHeader = req.headers.authorization;
  return authHeader?.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length)
    : undefined;
}

function hashApiKey(key: string) {
  return crypto.createHash("sha256").update(key).digest("hex");
}

async function authenticateApiKey(token: string) {
  if (!token.startsWith("vs_live_")) {
    return null;
  }

  const [apiKey] = await db
    .select()
    .from(apiKeysTable)
    .where(eq(apiKeysTable.keyHash, hashApiKey(token)))
    .limit(1);

  if (!apiKey || !apiKey.isActive) {
    return null;
  }

  if (apiKey.expiresAt && apiKey.expiresAt <= new Date()) {
    return null;
  }

  await db
    .update(apiKeysTable)
    .set({
      lastUsedAt: new Date(),
      requestCount: sql`${apiKeysTable.requestCount} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(apiKeysTable.id, apiKey.id));

  return apiKey;
}

export async function requireSupabaseUser(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  if (isPublicPath(req.path)) {
    next();
    return;
  }

  const token = getBearerToken(req);

  if (token) {
    const apiKey = await authenticateApiKey(token);
    if (apiKey) {
      res.locals.apiKey = apiKey;
      next();
      return;
    }
  }

  const authRequired = process.env.SUPABASE_AUTH_REQUIRED !== "false";
  if (!authRequired) {
    next();
    return;
  }

  if (!token) {
    res.status(401).json({ error: "Missing bearer token" });
    return;
  }

  if (!isSupabaseConfigured() || !supabase) {
    res.status(503).json({ error: "Supabase Auth is not configured" });
    return;
  }

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) {
    res.status(401).json({ error: "Invalid or expired token" });
    return;
  }

  res.locals.user = data.user;
  const role = typeof data.user.user_metadata?.role === "string" ? data.user.user_metadata.role : "member";
  if (role === "viewer" && !["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    res.status(403).json({ error: "Viewer access is read-only" });
    return;
  }
  if (role === "agent" && ["/team", "/sub-accounts", "/api-keys"].some((path) => req.path.startsWith(path))) {
    res.status(403).json({ error: "Agents cannot manage platform access" });
    return;
  }
  next();
}
