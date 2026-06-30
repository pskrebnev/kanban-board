import type pg from "pg";
import request from "supertest";
import { describe, expect, it } from "vitest";

import { createApp } from "../src/app.js";

// The public routes exercised here do not touch the database, so a stub pool is
// sufficient to assert the app wiring.
const stubPool = {} as unknown as pg.Pool;
const app = createApp(stubPool);

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

  it("returns 404 JSON for unknown routes handled by Express default", async () => {
    const response = await request(app).get("/api/does-not-exist");

    expect(response.status).toBe(404);
  });
});
