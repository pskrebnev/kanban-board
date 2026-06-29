import cors from "cors";
import express from "express";
import pg from "pg";

const { Pool } = pg;

const port = Number(process.env.PORT || 8080);
const databaseUrl =
  process.env.DATABASE_URL || "postgresql://user:password@localhost:5432/ticketing";

const app = express();
const pool = new Pool({ connectionString: databaseUrl });

app.use(cors());
app.use(express.json());

app.get("/api/health", (_request, response) => {
  response.json({
    service: "kanban-backend",
    status: "ok",
  });
});

app.get("/api/ready", async (_request, response) => {
  try {
    const result = await pool.query("select now() as now");
    response.json({
      database: "ok",
      now: result.rows[0].now,
    });
  } catch (error) {
    response.status(503).json({
      database: "unavailable",
      message: error.message,
    });
  }
});

app.get("/api", (_request, response) => {
  response.json({
    resources: ["auth", "teams", "epics", "tickets", "comments"],
  });
});

app.listen(port, "0.0.0.0", () => {
  console.log(`Kanban API listening on port ${port}`);
});
