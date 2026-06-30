import { Router, type Request, type RequestHandler, type Response } from "express";
import { z, type ZodType } from "zod";

import { ValidationError } from "../errors.js";
import type { EpicService } from "../services/epic-service.js";

const titleSchema = z
  .string()
  .trim()
  .min(1, "Epic title is required")
  .max(200, "Epic title is too long");

const descriptionSchema = z
  .string()
  .trim()
  .max(2000, "Description is too long")
  .nullable()
  .optional();

const createSchema = z.object({
  teamId: z.uuid("A valid team is required"),
  title: titleSchema,
  description: descriptionSchema,
});

const updateSchema = z.object({
  title: titleSchema,
  description: descriptionSchema,
  // Accepted only so the service can reject an attempt to move the epic.
  teamId: z.uuid().optional(),
});

const listQuerySchema = z.object({
  teamId: z.uuid("Invalid team id").optional(),
});

const idParamSchema = z.object({
  id: z.uuid("Invalid epic id"),
});

function parse<T>(schema: ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);

  if (!result.success) {
    throw new ValidationError(result.error.issues[0]?.message ?? "Invalid request");
  }

  return result.data;
}

function normalizeDescription(value: string | null | undefined): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  return value.length > 0 ? value : null;
}

export type EpicsRouterDeps = {
  epicService: EpicService;
  requireAuth: RequestHandler;
};

export function createEpicsRouter(deps: EpicsRouterDeps): Router {
  const { epicService, requireAuth } = deps;
  const router = Router();

  // Every epic endpoint requires an authenticated, verified session.
  router.use(requireAuth);

  router.get("/", async (request: Request, response: Response) => {
    const { teamId } = parse(listQuerySchema, request.query);
    const epics = await epicService.list(teamId);
    response.json({ epics });
  });

  router.post("/", async (request: Request, response: Response) => {
    const body = parse(createSchema, request.body);
    const epic = await epicService.create({
      teamId: body.teamId,
      title: body.title,
      description: normalizeDescription(body.description),
    });
    response.status(201).json({ epic });
  });

  router.patch("/:id", async (request: Request, response: Response) => {
    const { id } = parse(idParamSchema, request.params);
    const body = parse(updateSchema, request.body);
    const epic = await epicService.update(id, {
      title: body.title,
      description: normalizeDescription(body.description),
      teamId: body.teamId,
    });
    response.json({ epic });
  });

  router.delete("/:id", async (request: Request, response: Response) => {
    const { id } = parse(idParamSchema, request.params);
    await epicService.remove(id);
    response.status(204).send();
  });

  return router;
}
