import type { NextFunction, Request, Response } from "express";
import { isSupabaseConfigured, supabase } from "../lib/supabase.js";

const publicApiPaths = [
  "/healthz",
  "/oauth",
];

function isPublicPath(path: string) {
  return publicApiPaths.some((publicPath) =>
    path === publicPath || path.startsWith(`${publicPath}/`),
  );
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

  const authRequired = process.env.SUPABASE_AUTH_REQUIRED !== "false";
  if (!authRequired) {
    next();
    return;
  }

  if (!isSupabaseConfigured() || !supabase) {
    res.status(503).json({ error: "Supabase Auth is not configured" });
    return;
  }

  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length)
    : undefined;

  if (!token) {
    res.status(401).json({ error: "Missing bearer token" });
    return;
  }

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) {
    res.status(401).json({ error: "Invalid or expired token" });
    return;
  }

  res.locals.user = data.user;
  next();
}
