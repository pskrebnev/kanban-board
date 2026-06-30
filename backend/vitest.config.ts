import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    // The DB-backed tests share one database, so run test files sequentially to
    // avoid races (e.g. the integration test inserting rows while the migration
    // smoke test asserts the database is empty).
    fileParallelism: false,
  },
});
