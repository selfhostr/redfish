# Retention and backup

## Retention (anonymisation)

The `retention` job runs once a day in the worker (the worker seeds it at startup, then each run schedules the next one 24 hours later). For each organization, targets whose campaigns are **all** finished and older than `retentionDays` are anonymised: first and last name cleared, email replaced by `redacted-<id>@redacted.invalid`, `anonymizedAt` set.

`events` hold no personal data and campaign recipients are kept, so the statistics (funnel) are identical after anonymisation.

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

Test the restore regularly: restore to a temporary path (`-o /app/data/restore-test.db`) and check it with `sqlite3 ... "pragma integrity_check"`.
