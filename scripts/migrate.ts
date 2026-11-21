/**
 * Applique les migrations Drizzle (dossier `drizzle/`). Production : `node build/migrate.js`.
 * Avant d'appliquer des migrations en attente sur une base existante, prend un
 * instantané (`VACUUM INTO`). Variables : `MIGRATE_SNAPSHOT_KEEP` (défaut 3, 0 = désactivé),
 * `MIGRATE_SNAPSHOT_DIR` (défaut `<dossier de la base>/snapshots`).
 */
import Database from 'better-sqlite3';
import { runMigrations } from '../src/lib/server/db/migrate';
import { parseKeep, snapshotBeforeMigrate } from '../src/lib/server/db/snapshot';

const url = (process.env.DATABASE_URL ?? 'file:./data/redfish.db').replace(/^file:/, '');
const sqlite = new Database(url);
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('busy_timeout = 5000');
snapshotBeforeMigrate(sqlite, {
	dbPath: url,
	dir: process.env.MIGRATE_SNAPSHOT_DIR || undefined,
	keep: parseKeep(process.env.MIGRATE_SNAPSHOT_KEEP)
});
runMigrations(sqlite);
sqlite.close();
console.log('migrations applied');
