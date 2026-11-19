#!/bin/sh
set -e
# Apply pending migrations (idempotent). Disable with RUN_MIGRATIONS=false when a separate
# release job runs them (recommended with several replicas).
if [ "${RUN_MIGRATIONS:-true}" = "true" ]; then
  node node_modules/prisma/build/index.js migrate deploy
fi
exec "$@"
