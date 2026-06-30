import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { loadConfig } from "../src/config.js";

const originalEnv = { ...process.env };

beforeEach(() => {
  process.env = { ...originalEnv };
});

afterEach(() => {
  process.env = { ...originalEnv };
});

describe("loadConfig", () => {
  it("loads required values and applies defaults", () => {
    process.env.PORT = "8080";
    process.env.DATABASE_URL = "postgresql://user:pass@db:5432/ticketing";
    delete process.env.NODE_ENV;
    delete process.env.APP_BASE_URL;
    delete process.env.SMTP_HOST;

    const config = loadConfig();

    expect(config.port).toBe(8080);
    expect(config.databaseUrl).toBe("postgresql://user:pass@db:5432/ticketing");
    expect(config.nodeEnv).toBe("development");
    expect(config.appBaseUrl).toBe("http://localhost:3000");
    expect(config.smtp).toBeUndefined();
  });

  it("throws when DATABASE_URL is missing", () => {
    process.env.PORT = "8080";
    delete process.env.DATABASE_URL;

    expect(() => loadConfig()).toThrow(/DATABASE_URL/);
  });

  it("rejects an invalid PORT", () => {
    process.env.PORT = "not-a-port";
    process.env.DATABASE_URL = "postgresql://user:pass@db:5432/ticketing";

    expect(() => loadConfig()).toThrow(/PORT/);
  });

  it("builds SMTP config when SMTP_HOST is present", () => {
    process.env.PORT = "8080";
    process.env.DATABASE_URL = "postgresql://user:pass@db:5432/ticketing";
    process.env.SMTP_HOST = "relay1.dataart.com";
    process.env.SMTP_PORT = "25";

    const config = loadConfig();

    expect(config.smtp).toEqual({
      host: "relay1.dataart.com",
      port: 25,
      user: undefined,
      password: undefined,
      from: "no-reply@kanban.local",
    });
  });
});
