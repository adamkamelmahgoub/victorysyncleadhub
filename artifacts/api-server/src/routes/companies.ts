import { Router } from "express";
import { companyCrmRequest } from "../lib/company-crm.js";
const router = Router();
router.use(async (req, res, next) => {
  if (!/^\/(companies|company-crm)(\/|$)/.test(req.path)) {
    next();
    return;
  }
  // A real Supabase user is required to attribute activity, including in local development.
  if (!res.locals.user) {
    res
      .status(401)
      .json({ error: "Sign in with Supabase to use the company CRM." });
    return;
  }
  const result = await companyCrmRequest(
    req.method,
    req.originalUrl,
    req.headers.authorization ?? "",
    res.locals.user,
    async () => req.body,
  );
  res.status(result.status).json(result.data);
});
export default router;
