import cors from "cors";
import express, { type Request, type Response } from "express";
import pg from "pg";

const { Pool } = pg;

type ReadyResponse =
  | {
      database: "ok";
      now: Date;
    }
  | {
      database: "unavailable";
      message: string;
    };

function requireEnv(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

const port = Number(requireEnv("PORT"));
const databaseUrl = requireEnv("DATABASE_URL");

if (!Number.isInteger(port) || port <= 0) {
  throw new Error("PORT must be a positive integer");
}

const app = express();
const pool = new Pool({ connectionString: databaseUrl });

app.use(cors());
app.use(express.json());

app.get("/api/health", (_request: Request, response: Response) => {
  response.json({
    service: "kanban-backend",
    status: "ok",
  });
});

app.get("/api/ready", async (_request: Request, response: Response<ReadyResponse>) => {
  try {
    const result = await pool.query<{ now: Date }>("select now() as now");
    const row = result.rows[0];

    if (!row) {
      throw new Error("Database readiness query returned no rows");
    }

    response.json({
      database: "ok",
      now: row.now,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown database error";

    response.status(503).json({
      database: "unavailable",
      message,
    });
  }
});

app.get("/api", (_request: Request, response: Response) => {
  response.json({
    resources: ["auth", "teams", "epics", "tickets", "comments"],
  });
});

app.listen(port, "0.0.0.0", () => {
  console.log(`Kanban API listening on port ${port}`);
});
