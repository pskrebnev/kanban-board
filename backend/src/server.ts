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

const port = Number(process.env.PORT || 8080);
const databaseUrl =
  process.env.DATABASE_URL || "postgresql://user:password@localhost:5432/ticketing";

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
