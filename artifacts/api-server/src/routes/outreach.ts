import { Router, type IRouter } from "express";
import { pool } from "@workspace/db";
import { parseCall, parseOutreachUpdate } from "../../../../lib/outreach.js";

const router: IRouter = Router();
function scope(res: { locals: Record<string, any> }) {
  const metadata = res.locals.user?.user_metadata;
  return metadata?.role === "agent"
    ? (metadata.client_account_id ?? "__unassigned__")
    : null;
}
router.get("/outreach/queue", async (req, res) => {
  const { rows } = await pool.query(
    "select public.outreach_call_queue($1,$2) as queue",
    [req.query.timezone || null, scope(res)],
  );
  res.json(rows[0].queue);
});
router.get("/outreach/needs-timezone", async (_req, res) => {
  const { rows } = await pool.query(
    "select id,first_name,last_name,company,phone,custom_fields from public.outreach_eligible_leads where not timezone_confirmed and ($1::text is null or client_account_id::text=$1) order by created_at,id limit 100",
    [scope(res)],
  );
  res.json(rows);
});
router.post("/leads/:id/calls", async (req, res) => {
  try {
    const b = parseCall(req.body);
    const { rows } = await pool.query(
      "select public.outreach_log_call($1,$2,$3,$4,$5,$6,$7) as lead",
      [
        req.params.id,
        b.p_disposition,
        b.p_next_action_at,
        b.p_notes,
        b.p_request_id,
        res.locals.user?.id ?? "operator",
        scope(res),
      ],
    );
    res.status(201).json(rows[0].lead);
  } catch (error) {
    res
      .status(400)
      .json({
        error:
          error instanceof Error ? error.message : "Call could not be saved",
      });
  }
});
router.patch("/leads/:id/outreach", async (req, res) => {
  try {
    const data = parseOutreachUpdate(req.body);
    const fields = Object.keys(data);
    const { rows } = await pool.query(
      `update public.leads set ${fields.map((f, i) => `${f}=$${i + 1}`).join(",")} where id::text=$${fields.length + 1} and ($${fields.length + 2}::text is null or client_account_id::text=$${fields.length + 2}) returning *`,
      [...Object.values(data), req.params.id, scope(res)],
    );
    res
      .status(rows.length ? 200 : 404)
      .json(rows[0] ?? { error: "Lead not found" });
  } catch (error) {
    res
      .status(400)
      .json({
        error:
          error instanceof Error ? error.message : "Invalid outreach update",
      });
  }
});
export default router;
