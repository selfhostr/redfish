# Configuration

redfish reads its settings from environment variables. With Docker Compose they come from `.env` (copy `.env.example`). Every service loads the same file.

| Variable                       | Default                                            | Required              | Purpose                                                                                                                                                                                                                                                                                                 |
| ------------------------------ | -------------------------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `REDFISH_SECRET_KEY`           | none                                               | yes                   | Key used to encrypt secrets stored in the database. At least 32 bytes of entropy, for example `openssl rand -base64 32`. Checked at startup: a missing or weak key stops the app. Keep it: losing it makes stored secrets unreadable.                                                                   |
| `DATABASE_URL`                 | `file:./data/redfish.db`                           | no                    | SQLite database path, as `file:<path>`. Read by the app, the worker and the migration script.                                                                                                                                                                                                           |
| `ORIGIN`                       | none (`.env.example` uses `http://localhost:3000`) | no                    | adapter-node option. Pins every request to one fixed origin (also used for its CSRF check on form posts). Single-host or local development only: with host isolation (two hosts) do NOT set it, the tracking host would stop serving `/t/...`. Set `HOST_HEADER` and `PROTOCOL_HEADER` instead (below). |
| `DASHBOARD_HOST`               | empty                                              | with `TRACKING_HOST`  | Host name that serves the operator app.                                                                                                                                                                                                                                                                 |
| `TRACKING_HOST`                | empty                                              | with `DASHBOARD_HOST` | Host name that serves the public tracking pages (`/t/*`). Set both or neither: setting only one stops the app at startup. Both empty means no host restriction (local development). See [CSP and host isolation](csp-hosts.md).                                                                         |
| `WORKER_INTERVAL_MS`           | `5000`                                             | no                    | How often the worker polls the job queue, in milliseconds.                                                                                                                                                                                                                                              |
| `LITESTREAM_BUCKET`            | empty                                              | for backup            | S3 bucket name. Used by the `backup` compose profile.                                                                                                                                                                                                                                                   |
| `LITESTREAM_PATH`              | `redfish.db`                                       | for backup            | Object path prefix inside the bucket.                                                                                                                                                                                                                                                                   |
| `LITESTREAM_ENDPOINT`          | empty                                              | for backup            | S3 endpoint URL (needed for non-AWS providers).                                                                                                                                                                                                                                                         |
| `LITESTREAM_ACCESS_KEY_ID`     | empty                                              | for backup            | S3 access key id.                                                                                                                                                                                                                                                                                       |
| `LITESTREAM_SECRET_ACCESS_KEY` | empty                                              | for backup            | S3 secret access key.                                                                                                                                                                                                                                                                                   |
| `REDFISH_AUDIT_RETENTION_DAYS` | `365`                                              | no                    | How long audit log entries are kept, in days. See [retention and backup](retention-backup.md).                                                                                                                                                                                                          |
| `REDFISH_ORG_NAME`             | empty                                              | no                    | Name of the issuing organisation (the provider) shown in the campaign report header. Empty by default (generic report with no provider branding).                                                                                                                                                       |
| `REDFISH_ORG_CONTACT`          | empty                                              | no                    | Optional contact line for the issuing organisation, shown in the report footer.                                                                                                                                                                                                                         |
| `CAMPAIGN_OBSERVATION_DAYS`    | `14`                                               | no                    | Days after the last send (for a staggered campaign, the last planned send) before a campaign is closed automatically. A closed campaign no longer records tracking events and becomes eligible for retention and trends. It can also be closed manually.                                                |
| `MIGRATE_SNAPSHOT_KEEP`        | `3`                                                | no                    | Number of pre-migration snapshots to keep; `0` disables them. See [retention and backup](retention-backup.md).                                                                                                                                                                                          |
| `MIGRATE_SNAPSHOT_DIR`         | `<database folder>/snapshots`                      | no                    | Folder for pre-migration snapshots.                                                                                                                                                                                                                                                                     |
| `SEED_EMAIL`                   | none                                               | for seeding           | Email of the account to create.                                                                                                                                                                                                                                                                         |
| `SEED_PASSWORD`                | none                                               | for seeding           | Password of that account. Pass it on the command line, not in `.env`.                                                                                                                                                                                                                                   |
| `SEED_ROLE`                    | `operator`                                         | no                    | `operator` or `superadmin`. Only a superadmin can create and import scenarios.                                                                                                                                                                                                                          |

## First account

`SEED_*` variables are read by the seed script only. With the published image:

```sh
docker compose run --rm -e SEED_EMAIL=you@example.org -e SEED_PASSWORD='a-long-password' -e SEED_ROLE=superadmin web node build/seed.js
```

In development: `docker compose -f docker-compose.dev.yml run --rm -e SEED_EMAIL=... -e SEED_PASSWORD=... app npm run db:seed`.

## Set by the image

The Dockerfile sets `NODE_ENV=production`, `PORT=3000` and `HOST=0.0.0.0`.

## adapter-node options

These are read by SvelteKit's adapter-node, not by redfish. `ORIGIN` (above), `PORT` and `HOST` are also adapter-node options. The others are only needed behind a reverse proxy or to tune limits:

| Variable          | Purpose                                                                     |
| ----------------- | --------------------------------------------------------------------------- |
| `PROTOCOL_HEADER` | Header carrying the original scheme, for example `x-forwarded-proto`.       |
| `HOST_HEADER`     | Header carrying the original host, for example `x-forwarded-host`.          |
| `ADDRESS_HEADER`  | Header carrying the client address, for example `X-Forwarded-For`.          |
| `XFF_DEPTH`       | Number of trusted proxies in `X-Forwarded-For` (use with `ADDRESS_HEADER`). |
| `BODY_SIZE_LIMIT` | Maximum request body size (default 512K).                                   |

With host isolation (production), do not set `ORIGIN`: adapter-node would pin every request to that single origin and the tracking host would stop serving `/t/...`. Behind a reverse proxy, set `HOST_HEADER=x-forwarded-host` and `PROTOCOL_HEADER=x-forwarded-proto` so the origin of each request is derived from the proxy. `ORIGIN` remains fine for single-host or local development.

`ADDRESS_HEADER` is required behind a reverse proxy, otherwise rate limiting sees every client as the proxy: see [Deployment](deployment.md).

See the [adapter-node documentation](https://svelte.dev/docs/kit/adapter-node#Environment-variables) for the full list.

Sending profiles (SMTP) are not environment variables: you create them in the app, per organization.

See also [retention and backup](retention-backup.md).
