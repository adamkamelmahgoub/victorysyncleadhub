import type { Request, Response } from "express";
import { and, eq } from "drizzle-orm";
import { leadsTable } from "@workspace/db";

type ResponseWithLocals = Response;

export function currentClientAccountId(res: ResponseWithLocals) {
  const value = res.locals.user?.user_metadata?.client_account_id;
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function currentRole(res: ResponseWithLocals) {
  const value = res.locals.user?.user_metadata?.role;
  return typeof value === "string" ? value : "member";
}

export function isPlatformManager(res: ResponseWithLocals) {
  if (!res.locals.user) return true;
  return !currentClientAccountId(res) && ["owner", "admin"].includes(currentRole(res));
}

export function requirePlatformManager(res: ResponseWithLocals) {
  if (isPlatformManager(res)) return true;
  res.status(403).json({ error: "Client accounts are restricted to platform administrators" });
  return false;
}

export function actorLabel(res: ResponseWithLocals) {
  const user = res.locals.user;
  return typeof user?.email === "string"
    ? user.email
    : typeof user?.user_metadata?.full_name === "string"
      ? user.user_metadata.full_name
      : "System";
}

export function requestedClientAccountId(req: Request, res: ResponseWithLocals) {
  const assignedClientId = currentClientAccountId(res);
  if (assignedClientId) return assignedClientId;
  if (!isPlatformManager(res)) return null;

  const queryValue = req.query.clientAccountId;
  const bodyValue = req.body?.clientAccountId;
  const requested = typeof queryValue === "string"
    ? queryValue
    : typeof bodyValue === "string"
      ? bodyValue
      : null;
  return requested && requested.length > 0 ? requested : null;
}

export function leadAccessCondition(leadId: number, res: ResponseWithLocals) {
  const clientId = currentClientAccountId(res);
  return and(
    eq(leadsTable.id, leadId),
    clientId ? eq(leadsTable.clientAccountId, clientId) : undefined,
  );
}
