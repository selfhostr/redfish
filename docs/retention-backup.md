# Retention and backup

## Retention (anonymisation)

The `retention` job runs once a day in the worker (the worker seeds it at startup, then each run schedules the next one 24 hours later). For each organization, targets whose campaigns are **all** finished and older than `retentionDays` are anonymised: first and last name cleared, email replaced by `redacted-<id>@redacted.invalid`, `anonymizedAt` set.

`events` hold no personal data and campaign recipients are kept, so the statistics (funnel) are identical after anonymisation.

Targets **never used in any campaign** are deleted by the same job once `retentionDays` have elapsed since their creation (they hold personal data but no statistics).

## Individual rights (access, erasure)

The « Données personnelles (RGPD) » page (`/privacy`, linked from the « Destinataires » page) searches an email across all lists of the active client. It can export everything stored about the person as JSON (target rows, campaign participation, events with timestamps), or erase them: targets used in campaigns are anonymised (same as retention, statistics preserved), unused ones are deleted. On a list page, a single target can be edited, deleted (if unused) or anonymised (if used). Every export, anonymisation and deletion is written to the audit log with a salted hash of the email, never the email itself.

## Audit log retention

The same job deletes audit log entries older than `REDFISH_AUDIT_RETENTION_DAYS` (365 days by default), as well as expired sessions and second login steps. The period is global, not per organization: the log traces operator actions (not targets) and must also cover entries with no organization (logins) or from a deleted organization. It holds no IP address and no email typed during a failed login, only the email of the operator account concerned. See [account-security.md](account-security.md).

## Litestream backup

SQLite runs in WAL mode. Litestream continuously replicates `data/redfish.db` to S3-compatible storage.

1. Fill in the `LITESTREAM_*` variables in `.env` (see `.env.example`). Secrets are never committed.
2. Start it: `docker compose --profile backup up -d litestream`.

### Restore

With the app stopped and the database absent:

```sh
docker compose --profile backup run --rm --entrypoint litestream litestream \
  restore -config /etc/litestream.yml -o /app/data/redfish.db /app/data/redfish.db
```

### Snapshot before migrations

At startup, `migrate.js` takes a consistent snapshot (`VACUUM INTO`) of the database **only** if it exists and has pending migrations. It is written to `data/snapshots/redfish.db.pre-migrate-<timestamp>.db` (persistent volume; the subfolder is ignored by Litestream, which only tracks `redfish.db`). The 3 most recent snapshots are kept: set `MIGRATE_SNAPSHOT_KEEP=N` to change that, `0` to disable; set `MIGRATE_SNAPSHOT_DIR` to use another folder.

Rolling back after a bad migration: stop web and worker, then `cp data/snapshots/<snapshot>.db data/redfish.db` and delete `data/redfish.db-wal` and `data/redfish.db-shm`. Restart the previous image.

Test the restore regularly: restore to a temporary path (`-o /app/data/restore-test.db`) and check it with `sqlite3 ... "pragma integrity_check"`.
