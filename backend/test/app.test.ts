import type pg from "pg";
import request from "supertest";
import { describe, expect, it } from "vitest";

import { createApp } from "../src/app.js";
import type { AuthService } from "../src/services/auth-service.js";

// The public routes exercised here do not touch the database or auth service,
// so stubs are sufficient to assert the app wiring.
const stubPool = {} as unknown as pg.Pool;
const stubAuthService = {} as unknown as AuthService;

const app = createApp({
  pool: stubPool,
  authService: stubAuthService,
  jwtSecret: "test-secret",
  cookieSecure: false,
});

describe("public API routes", () => {
  it("reports health", async () => {
    const response = await request(app).get("/api/health");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ service: "kanban-backend", status: "ok" });
  });

  it("lists resource areas", async () => {
    const response = await request(app).get("/api");

    expect(response.status).toBe(200);
    expect(response.body.resources).toEqual([
      "auth",
      "teams",
      "epics",
      "tickets",
      "comments",
    ]);
  });

  it("requires authentication for the current-user endpoint", async () => {
    const response = await request(app).get("/api/auth/me");

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("unauthorized");
  });

  it("requires authentication to list teams", async () => {
    const response = await request(app).get("/api/teams");

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("unauthorized");
  });

  it("requires authentication to list epics", async () => {
    const response = await request(app).get("/api/epics");

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("unauthorized");
  });

  it("requires authentication to list tickets", async () => {
    const response = await request(app).get("/api/tickets");

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("unauthorized");
  });
});
