import { Router, type IRouter } from "express";
import healthRouter from "./health";
import leadsRouter from "./leads";
import campaignsRouter from "./campaigns";
import formsRouter from "./forms";
import activitiesRouter from "./activities";
import notesRouter from "./notes";
import analyticsRouter from "./analytics";
import scraperRouter from "./scraper";
import emailAccountsRouter from "./email-accounts";
import pipelineRouter from "./pipeline";
import sequencesRouter from "./sequences";
import teamRouter from "./team";
import integrationsRouter from "./integrations";
import automationsRouter from "./automations";
import oauthRouter from "./oauth";
import segmentsRouter from "./segments";

const router: IRouter = Router();

router.use(healthRouter);
router.use(leadsRouter);
router.use(campaignsRouter);
router.use(formsRouter);
router.use(activitiesRouter);
router.use(notesRouter);
router.use(analyticsRouter);
router.use(scraperRouter);
router.use(emailAccountsRouter);
router.use(pipelineRouter);
router.use(sequencesRouter);
router.use(teamRouter);
router.use(integrationsRouter);
router.use(automationsRouter);
router.use(oauthRouter);
router.use(segmentsRouter);

export default router;
