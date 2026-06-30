import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { createPool } from "./db/pool.js";
import { createConsoleMailer, createSmtpMailer, type Mailer } from "./email/mailer.js";
import { createAuthService } from "./services/auth-service.js";

const config = loadConfig();

if (!config.jwtSecret) {
  throw new Error("Missing required environment variable: JWT_SECRET");
}

const pool = createPool(config.databaseUrl);

const mailer: Mailer = config.smtp ? createSmtpMailer(config.smtp) : createConsoleMailer();

const authService = createAuthService({
  pool,
  mailer,
  appBaseUrl: config.appBaseUrl,
});

const app = createApp({
  pool,
  authService,
  jwtSecret: config.jwtSecret,
  cookieSecure: config.cookieSecure,
});

app.listen(config.port, "0.0.0.0", () => {
  console.log(`Kanban API listening on port ${config.port}`);
});
