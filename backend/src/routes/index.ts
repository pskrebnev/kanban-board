import { Router, type Request, type Response } from "express";
import type pg from "pg";

import { query } from "../db/pool.js";

type ReadyResponse =
  | {
      database: "ok";
      now: string;
    }
  | {
      database: "unavailable";
      message: string;
    };

/**
 * Builds the `/api` router. Health and readiness endpoints stay public; future
 * business resources (auth, teams, epics, tickets, comments) will be mounted
 * here behind authentication in later phases.
 */
export function createApiRouter(pool: pg.Pool): Router {
  const router = Router();

  router.get("/health", (_request: Request, response: Response) => {
    response.json({
      service: "kanban-backend",
      status: "ok",
    });
  });

  router.get("/ready", async (_request: Request, response: Response<ReadyResponse>) => {
    try {
      const result = await query<{ now: Date }>(pool, "select now() as now");
      const row = result.rows[0];

      if (!row) {
        throw new Error("Database readiness query returned no rows");
      }

      response.json({
        database: "ok",
        now: row.now.toISOString(),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown database error";

      response.status(503).json({
        database: "unavailable",
        message,
      });
    }
  });

  router.get("/", (_request: Request, response: Response) => {
    response.json({
      resources: ["auth", "teams", "epics", "tickets", "comments"],
    });
  });

  return router;
}
