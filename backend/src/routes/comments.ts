import { Router, type Request, type RequestHandler, type Response } from "express";
import { z, type ZodType } from "zod";

import { UnauthorizedError, ValidationError } from "../errors.js";
import type { CommentService } from "../services/comment-service.js";

const bodySchema = z.object({
  body: z.string().trim().min(1, "Comment body is required").max(20000, "Comment body is too long"),
});

// The router is mounted under /api/tickets/:ticketId/comments, so :ticketId is
// available via mergeParams.
const ticketIdParamSchema = z.object({
  ticketId: z.uuid("Invalid ticket id"),
});

function parse<T>(schema: ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new ValidationError(result.error.issues[0]?.message ?? "Invalid request");
  }
  return result.data;
}

export type CommentsRouterDeps = {
  commentService: CommentService;
  requireAuth: RequestHandler;
};

export function createCommentsRouter(deps: CommentsRouterDeps): Router {
  const { commentService, requireAuth } = deps;
  const router = Router({ mergeParams: true });

  router.use(requireAuth);

  router.get("/", async (request: Request, response: Response) => {
    const { ticketId } = parse(ticketIdParamSchema, request.params);
    const comments = await commentService.list(ticketId);
    response.json({ comments });
  });

  router.post("/", async (request: Request, response: Response) => {
    // author_id always comes from the authenticated session, never the body.
    if (!request.user) {
      throw new UnauthorizedError();
    }
    const { ticketId } = parse(ticketIdParamSchema, request.params);
    const { body } = parse(bodySchema, request.body);
    const comment = await commentService.add(ticketId, body, request.user.id);
    response.status(201).json({ comment });
  });

  return router;
}
