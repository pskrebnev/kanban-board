import { Router, type Request, type RequestHandler, type Response } from "express";
import { z, type ZodType } from "zod";

import { UnauthorizedError, ValidationError } from "../errors.js";
import { TICKET_STATES, TICKET_TYPES } from "../repositories/ticket-repository.js";
import type { TicketService } from "../services/ticket-service.js";

const typeSchema = z.enum(TICKET_TYPES);
const stateSchema = z.enum(TICKET_STATES);
const titleSchema = z.string().trim().min(1, "Title is required").max(200, "Title is too long");
const bodySchema = z.string().trim().min(1, "Body is required").max(20000, "Body is too long");

const listQuerySchema = z.object({
  teamId: z.uuid("Invalid team id").optional(),
  state: stateSchema.optional(),
  type: typeSchema.optional(),
  epicId: z.uuid("Invalid epic id").optional(),
});

const createSchema = z.object({
  teamId: z.uuid("A valid team is required"),
  epicId: z.uuid("Invalid epic id").nullable().optional(),
  type: typeSchema,
  state: stateSchema.optional(),
  title: titleSchema,
  body: bodySchema,
});

const updateSchema = z.object({
  teamId: z.uuid("Invalid team id").optional(),
  epicId: z.uuid("Invalid epic id").nullable().optional(),
  type: typeSchema.optional(),
  state: stateSchema.optional(),
  title: titleSchema.optional(),
  body: bodySchema.optional(),
});

const stateBodySchema = z.object({
  state: stateSchema,
});

const idParamSchema = z.object({
  id: z.uuid("Invalid ticket id"),
});

function parse<T>(schema: ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new ValidationError(result.error.issues[0]?.message ?? "Invalid request");
  }
  return result.data;
}

export type TicketsRouterDeps = {
  ticketService: TicketService;
  requireAuth: RequestHandler;
};

export function createTicketsRouter(deps: TicketsRouterDeps): Router {
  const { ticketService, requireAuth } = deps;
  const router = Router();

  router.use(requireAuth);

  router.get("/", async (request: Request, response: Response) => {
    const filters = parse(listQuerySchema, request.query);
    const tickets = await ticketService.list(filters);
    response.json({ tickets });
  });

  router.get("/:id", async (request: Request, response: Response) => {
    const { id } = parse(idParamSchema, request.params);
    const ticket = await ticketService.get(id);
    if (!ticket) {
      response.status(404).json({ error: { code: "not_found", message: "Ticket not found" } });
      return;
    }
    response.json({ ticket });
  });

  router.post("/", async (request: Request, response: Response) => {
    // created_by always comes from the authenticated session, never the body.
    if (!request.user) {
      throw new UnauthorizedError();
    }
    const body = parse(createSchema, request.body);
    const ticket = await ticketService.create(
      {
        teamId: body.teamId,
        epicId: body.epicId ?? null,
        type: body.type,
        state: body.state,
        title: body.title,
        body: body.body,
      },
      request.user.id,
    );
    response.status(201).json({ ticket });
  });

  router.patch("/:id", async (request: Request, response: Response) => {
    const { id } = parse(idParamSchema, request.params);
    const body = parse(updateSchema, request.body);
    const ticket = await ticketService.update(id, body);
    response.json({ ticket });
  });

  router.patch("/:id/state", async (request: Request, response: Response) => {
    const { id } = parse(idParamSchema, request.params);
    const { state } = parse(stateBodySchema, request.body);
    const ticket = await ticketService.changeState(id, state);
    response.json({ ticket });
  });

  router.delete("/:id", async (request: Request, response: Response) => {
    const { id } = parse(idParamSchema, request.params);
    await ticketService.remove(id);
    response.status(204).send();
  });

  return router;
}
