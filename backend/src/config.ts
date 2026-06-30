export type SmtpConfig = {
  host: string;
  port: number;
  user?: string;
  password?: string;
  from: string;
};

export type AppConfig = {
  nodeEnv: string;
  port: number;
  databaseUrl: string;
  appBaseUrl: string;
  /** Optional until Phase 2 (authentication) wires it in. */
  jwtSecret?: string;
  /** Whether the session cookie should require HTTPS. Defaults to false for local HTTP. */
  cookieSecure: boolean;
  /** Optional until Phase 2 (email verification) wires it in. */
  smtp?: SmtpConfig;
};

function requireEnv(name: string): string {
  const value = process.env[name];

  if (value === undefined || value.trim() === "") {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function optionalEnv(name: string): string | undefined {
  const value = process.env[name];

  if (value === undefined || value.trim() === "") {
    return undefined;
  }

  return value;
}

function parsePort(raw: string, name: string): number {
  const port = Number(raw);

  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error(`${name} must be an integer between 1 and 65535`);
  }

  return port;
}

function loadSmtp(): SmtpConfig | undefined {
  const host = optionalEnv("SMTP_HOST");

  if (host === undefined) {
    return undefined;
  }

  return {
    host,
    port: parsePort(optionalEnv("SMTP_PORT") ?? "587", "SMTP_PORT"),
    user: optionalEnv("SMTP_USER"),
    password: optionalEnv("SMTP_PASSWORD"),
    from: optionalEnv("SMTP_FROM") ?? "no-reply@kanban.local",
  };
}

/**
 * Loads and validates configuration from the environment. Fails fast when a
 * required value is missing so misconfiguration surfaces at startup rather than
 * during a request.
 */
export function loadConfig(): AppConfig {
  return {
    nodeEnv: optionalEnv("NODE_ENV") ?? "development",
    port: parsePort(requireEnv("PORT"), "PORT"),
    databaseUrl: requireEnv("DATABASE_URL"),
    appBaseUrl: optionalEnv("APP_BASE_URL") ?? "http://localhost:3000",
    jwtSecret: optionalEnv("JWT_SECRET"),
    cookieSecure: (optionalEnv("COOKIE_SECURE") ?? "false").toLowerCase() === "true",
    smtp: loadSmtp(),
  };
}
