#!/bin/sh
set -e

echo "Building alchemist lab..."
(cd "${ALCHEMIST_ROOT:-/alchemist}" && npm run build)

echo "Running migrations..."
node_modules/.bin/tsx src/db/migrate.ts

echo "Starting Being..."
exec node_modules/.bin/tsx src/cli/index.ts
