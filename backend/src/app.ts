import cors from "cors";
import express, { type Express } from "express";
import type pg from "pg";

import { errorHandler } from "./middleware/error-handler.js";
import { createApiRouter } from "./routes/index.js";

/**
 * Composition root for the Express application. Kept separate from the server
 * bootstrap so tests can exercise the app with a supplied pool and without
 * binding a network port.
 */
export function createApp(pool: pg.Pool): Express {
  const app = express();

  app.use(cors());
  app.use(express.json());

  app.use("/api", createApiRouter(pool));

  app.use(errorHandler);

  return app;
}
