#!/bin/sh
set -e

# Apply pending database migrations before the API starts serving traffic.
# Postgres may not be ready the instant the backend container starts, so retry
# the migration step a bounded number of times.

attempts=0
max_attempts=30

until npm run migrate:up; do
  attempts=$((attempts + 1))

  if [ "$attempts" -ge "$max_attempts" ]; then
    echo "Database migrations failed after ${max_attempts} attempts; giving up." >&2
    exit 1
  fi

  echo "Migration attempt ${attempts} failed (database may not be ready yet); retrying in 2s..."
  sleep 2
done

echo "Migrations applied."

# Optional development/QA seed data. Disabled by default so a fresh database
# stays schema-only (spec §13). Enabled via SEED_ON_START=true in the ephemeral
# seed compose file; the seed script truncates and reloads a fixed dataset.
if [ "$SEED_ON_START" = "true" ]; then
  echo "SEED_ON_START=true -> loading test data."
  node dist/seed.js
fi

echo "Starting API."
exec node dist/server.js
