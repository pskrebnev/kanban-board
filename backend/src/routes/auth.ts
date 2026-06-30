import { Router, type CookieOptions, type Request, type RequestHandler, type Response } from "express";
import { z, type ZodType } from "zod";

import { signSession } from "../auth/jwt.js";
import { ValidationError } from "../errors.js";
import { SESSION_COOKIE } from "../middleware/require-auth.js";
import type { AuthService } from "../services/auth-service.js";

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const signupSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(8),
});

const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
});

const resendSchema = z.object({
  email: z.string().trim().email(),
});

const verifyQuerySchema = z.object({
  token: z.string().min(1),
});

function parse<T>(schema: ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);

  if (!result.success) {
    throw new ValidationError(result.error.issues[0]?.message ?? "Invalid request");
  }

  return result.data;
}

function sessionCookieOptions(secure: boolean): CookieOptions {
  return {
    httpOnly: true,
    sameSite: "strict",
    secure,
    path: "/",
    maxAge: SESSION_TTL_MS,
  };
}

export type AuthRouterDeps = {
  authService: AuthService;
  jwtSecret: string;
  cookieSecure: boolean;
  requireAuth: RequestHandler;
};

export function createAuthRouter(deps: AuthRouterDeps): Router {
  const { authService, jwtSecret, cookieSecure, requireAuth } = deps;
  const router = Router();

  router.post("/signup", async (request: Request, response: Response) => {
    const { email, password } = parse(signupSchema, request.body);
    await authService.signup(email, password);
    response.status(201).json({
      message: "Account created. Check your email to verify your account.",
    });
  });

  router.get("/verify", async (request: Request, response: Response) => {
    const { token } = parse(verifyQuerySchema, request.query);
    await authService.verify(token);
    response.json({ message: "Email verified. You can now log in." });
  });

  router.post("/resend", async (request: Request, response: Response) => {
    const { email } = parse(resendSchema, request.body);
    await authService.resend(email);
    response.json({
      message: "If an unverified account exists for that email, a new verification link was sent.",
    });
  });

  router.post("/login", async (request: Request, response: Response) => {
    const { email, password } = parse(loginSchema, request.body);
    const user = await authService.login(email, password);

    const token = signSession({ sub: user.id, email: user.email }, jwtSecret);
    response.cookie(SESSION_COOKIE, token, sessionCookieOptions(cookieSecure));

    response.json({ user });
  });

  router.post("/logout", (_request: Request, response: Response) => {
    response.clearCookie(SESSION_COOKIE, { path: "/" });
    response.json({ message: "Logged out" });
  });

  router.get("/me", requireAuth, (request: Request, response: Response) => {
    response.json({ user: request.user });
  });

  return router;
}
