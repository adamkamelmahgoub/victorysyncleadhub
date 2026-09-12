import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { existsSync } from "fs";
import router from "./routes/index.js";
import { logger } from "./lib/logger.js";
import { requireSupabaseUser } from "./middleware/auth.js";
import companiesRouter from "./routes/companies.js";
import { emailEngineRouter } from './routes/email-engine.js';

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return { id: req.id, method: req.method, url: req.url?.split("?")[0] };
      },
      res(res) {
        return { statusCode: res.statusCode };
      },
    },
  }),
);
app.use(cors());
app.use(express.json({verify(req,_res,buffer){(req as any).rawEmailBody=buffer.toString('utf8');}}));
app.use(express.urlencoded({ extended: true }));

app.use('/api',emailEngineRouter(true));
app.use('/api',requireSupabaseUser,emailEngineRouter(false),companiesRouter,router);

// In production, serve the Vite-built frontend as static files and handle SPA routing
if (process.env.NODE_ENV === "production") {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const staticPath = join(__dirname, "../../leadgen/dist/public");
  if (existsSync(staticPath)) {
    app.use(express.static(staticPath));
    app.get(/.*/, (_req, res) => {
      res.sendFile(join(staticPath, "index.html"));
    });
    logger.info({ staticPath }, "Serving frontend static files");
  }
}

export default app;
