# Rétention et sauvegarde

## Rétention (anonymisation)

Le job `retention` s'exécute une fois par jour dans le worker (le worker l'amorce au démarrage, puis chaque exécution replanifie la suivante à +24 h). Pour chaque organisation, les cibles dont **toutes** les campagnes sont terminées et plus anciennes que `retentionDays` sont anonymisées : nom et prénom vidés, e-mail remplacé par `redacted-<id>@redacted.invalid`, `anonymizedAt` renseigné.

Les `events` ne contiennent aucune donnée personnelle et les destinataires de campagne sont conservés : les statistiques (entonnoir) restent identiques après anonymisation.

## Sauvegarde Litestream

SQLite fonctionne en mode WAL ; Litestream réplique `data/redfish.db` en continu vers un stockage compatible S3.

1. Renseigner les variables `LITESTREAM_*` dans `.env` (voir `.env.example`). Les secrets ne sont jamais commités.
2. Démarrer : `docker compose --profile backup up -d litestream`.

### Restauration

Application arrêtée, base absente :

```sh
docker compose --profile backup run --rm --entrypoint litestream litestream \
  restore -config /etc/litestream.yml -o /app/data/redfish.db /app/data/redfish.db
```

Tester la restauration périodiquement : restaurer vers un chemin temporaire (`-o /app/data/restore-test.db`) et vérifier avec `sqlite3 ... "pragma integrity_check"`.
