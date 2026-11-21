/** Applique les migrations Drizzle (dossier `drizzle/`). Production : `node build/migrate.js`. */
import Database from 'better-sqlite3';
import { runMigrations } from '../src/lib/server/db/migrate';

const url = (process.env.DATABASE_URL ?? 'file:./data/redfish.db').replace(/^file:/, '');
const sqlite = new Database(url);
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('busy_timeout = 5000');
runMigrations(sqlite);
sqlite.close();
console.log('migrations applied');
