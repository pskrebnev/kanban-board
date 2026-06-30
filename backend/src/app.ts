import cookieParser from "cookie-parser";
import cors from "cors";
import express, { type Express } from "express";
import type pg from "pg";

import { errorHandler } from "./middleware/error-handler.js";
import { createRequireAuth } from "./middleware/require-auth.js";
import { createAuthRouter } from "./routes/auth.js";
import { createCommentsRouter } from "./routes/comments.js";
import { createEpicsRouter } from "./routes/epics.js";
import { createApiRouter } from "./routes/index.js";
import { createTeamsRouter } from "./routes/teams.js";
import { createTicketsRouter } from "./routes/tickets.js";
import type { AuthService } from "./services/auth-service.js";
import { createCommentService } from "./services/comment-service.js";
import { createEpicService } from "./services/epic-service.js";
import { createTeamService } from "./services/team-service.js";
import { createTicketService } from "./services/ticket-service.js";

export type AppDeps = {
  pool: pg.Pool;
  authService: AuthService;
  jwtSecret: string;
  cookieSecure: boolean;
};

/**
 * Composition root for the Express application. Kept separate from the server
 * bootstrap so tests can exercise the app with supplied dependencies and
 * without binding a network port.
 */
export function createApp(deps: AppDeps): Express {
  const { pool, authService, jwtSecret, cookieSecure } = deps;
  const requireAuth = createRequireAuth(pool, jwtSecret);
  const teamService = createTeamService({ pool });
  const epicService = createEpicService({ pool });
  const ticketService = createTicketService({ pool });
  const commentService = createCommentService({ pool });

  const app = express();

  app.use(cors());
  app.use(cookieParser());
  app.use(express.json());

  app.use("/api", createApiRouter(pool));
  app.use("/api/auth", createAuthRouter({ authService, jwtSecret, cookieSecure, requireAuth }));
  app.use("/api/teams", createTeamsRouter({ teamService, requireAuth }));
  app.use("/api/epics", createEpicsRouter({ epicService, requireAuth }));
  app.use("/api/tickets", createTicketsRouter({ ticketService, requireAuth }));
  app.use(
    "/api/tickets/:ticketId/comments",
    createCommentsRouter({ commentService, requireAuth }),
  );

  app.use(errorHandler);

  return app;
}
