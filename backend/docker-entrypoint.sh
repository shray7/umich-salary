#!/bin/sh
set -e
# Wait for Postgres and run schema init (idempotent)
until node src/db/init.js 2>/dev/null; do
  echo "Waiting for Postgres..."
  sleep 2
done
echo "Database ready."

# Optional: run seed when RUN_SEED=1 (e.g. first-time setup)
if [ -n "$RUN_SEED" ]; then
  echo "Running seed..."
  node src/db/seed.js || true
fi

exec node src/index.js
