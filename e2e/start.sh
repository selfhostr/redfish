#!/bin/sh
# Prepares a throwaway SQLite database (migrations + demo data), builds the
# app, then starts it. Expected variables : DATABASE_URL, REDFISH_SECRET_KEY, PORT.
# DEMO_SEED picks the npm seed script (default: db:seed:demo).
set -eu
DB="${DATABASE_URL#file:}"
rm -f "$DB" "$DB-wal" "$DB-shm"
# tsx resolves $lib through .svelte-kit/tsconfig.json, absent from a fresh checkout.
npx svelte-kit sync
npm run db:migrate
npm run "${DEMO_SEED:-db:seed:demo}"
npm run build
exec node build
