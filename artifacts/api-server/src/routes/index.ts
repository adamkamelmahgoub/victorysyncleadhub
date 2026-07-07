import { Router, type IRouter } from "express";
import healthRouter from "./health";
import leadsRouter from "./leads";
import campaignsRouter from "./campaigns";
import formsRouter from "./forms";
import activitiesRouter from "./activities";
import notesRouter from "./notes";
import analyticsRouter from "./analytics";
import scraperRouter from "./scraper";

const router: IRouter = Router();

router.use(healthRouter);
router.use(leadsRouter);
router.use(campaignsRouter);
router.use(formsRouter);
router.use(activitiesRouter);
router.use(notesRouter);
router.use(analyticsRouter);
router.use(scraperRouter);

export default router;
