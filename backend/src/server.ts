import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { createPool } from "./db/pool.js";

const config = loadConfig();
const pool = createPool(config.databaseUrl);
const app = createApp(pool);

app.listen(config.port, "0.0.0.0", () => {
  console.log(`Kanban API listening on port ${config.port}`);
});
