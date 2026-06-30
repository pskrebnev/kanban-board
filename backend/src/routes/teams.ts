import { Router, type Request, type RequestHandler, type Response } from "express";
import { z, type ZodType } from "zod";

import { ValidationError } from "../errors.js";
import type { TeamService } from "../services/team-service.js";

const nameSchema = z.object({
  name: z.string().trim().min(1, "Team name is required").max(100, "Team name is too long"),
});

const idParamSchema = z.object({
  id: z.uuid("Invalid team id"),
});

function parse<T>(schema: ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);

  if (!result.success) {
    throw new ValidationError(result.error.issues[0]?.message ?? "Invalid request");
  }

  return result.data;
}

export type TeamsRouterDeps = {
  teamService: TeamService;
  requireAuth: RequestHandler;
};

export function createTeamsRouter(deps: TeamsRouterDeps): Router {
  const { teamService, requireAuth } = deps;
  const router = Router();

  // Every team endpoint requires an authenticated, verified session.
  router.use(requireAuth);

  router.get("/", async (_request: Request, response: Response) => {
    const teams = await teamService.list();
    response.json({ teams });
  });

  router.post("/", async (request: Request, response: Response) => {
    const { name } = parse(nameSchema, request.body);
    const team = await teamService.create(name);
    response.status(201).json({ team });
  });

  router.patch("/:id", async (request: Request, response: Response) => {
    const { id } = parse(idParamSchema, request.params);
    const { name } = parse(nameSchema, request.body);
    const team = await teamService.rename(id, name);
    response.json({ team });
  });

  router.delete("/:id", async (request: Request, response: Response) => {
    const { id } = parse(idParamSchema, request.params);
    await teamService.remove(id);
    response.status(204).send();
  });

  return router;
}
