#!/bin/sh
set -e

echo "Running migrations..."
node_modules/.bin/tsx src/db/migrate.ts

echo "Starting Being..."
exec node_modules/.bin/tsx src/cli/index.ts
