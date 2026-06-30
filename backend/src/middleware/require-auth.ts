import type { NextFunction, Request, RequestHandler, Response } from "express";
import type pg from "pg";

import { verifySession } from "../auth/jwt.js";
import { ForbiddenError, UnauthorizedError } from "../errors.js";
import { findUserById } from "../repositories/user-repository.js";

export const SESSION_COOKIE = "kanban_session";

/**
 * Builds middleware that requires an authenticated, verified user. Reads the
 * session JWT from the httpOnly cookie, loads the user, and attaches it to the
 * request. Rejects anonymous (401) and unverified (403) requests.
 */
export function createRequireAuth(pool: pg.Pool, jwtSecret: string): RequestHandler {
  return async (request: Request, _response: Response, next: NextFunction) => {
    try {
      const token = request.cookies?.[SESSION_COOKIE] as string | undefined;

      if (!token) {
        throw new UnauthorizedError();
      }

      const claims = verifySession(token, jwtSecret);

      if (!claims) {
        throw new UnauthorizedError();
      }

      const user = await findUserById(pool, claims.sub);

      if (!user) {
        throw new UnauthorizedError();
      }

      if (!user.email_verified) {
        throw new ForbiddenError("Please verify your email before continuing");
      }

      request.user = {
        id: user.id,
        email: user.email,
        emailVerified: user.email_verified,
      };

      next();
    } catch (error) {
      next(error);
    }
  };
}
