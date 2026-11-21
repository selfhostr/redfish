/** Applique les migrations Drizzle (dossier `drizzle/`). Production : `node build/migrate.js`. */
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';

const url = (process.env.DATABASE_URL ?? 'file:./data/redfish.db').replace(/^file:/, '');
const sqlite = new Database(url);
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('busy_timeout = 5000');
migrate(drizzle(sqlite), { migrationsFolder: 'drizzle' });
sqlite.close();
console.log('migrations applied');
