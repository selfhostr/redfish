#!/bin/sh
# Prepares a throwaway SQLite database (migrations + demo data), builds the
# app, then starts it. Expected variables : DATABASE_URL, REDFISH_SECRET_KEY, PORT.
set -eu
DB="${DATABASE_URL#file:}"
rm -f "$DB" "$DB-wal" "$DB-shm"
npm run db:migrate
npm run db:seed:demo
npm run build
exec node build
