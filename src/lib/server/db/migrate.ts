import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';

export const MIGRATIONS_FOLDER = 'drizzle';

/**
 * Applique les migrations Drizzle sur une connexion better-sqlite3.
 *
 * Certaines migrations recréent une table (seule façon en SQLite de modifier
 * une colonne, p. ex. rendre `scenarios.path` nullable en 0003) : CREATE
 * `__new_table`, INSERT SELECT, DROP TABLE, RENAME. Le `PRAGMA
 * foreign_keys=OFF` écrit dans le fichier `.sql` est inopérant : le migrateur
 * Drizzle enveloppe toutes les instructions dans une transaction, et SQLite
 * interdit de modifier `foreign_keys` à l'intérieur d'une transaction. Sur une
 * base déjà peuplée, le `DROP TABLE` échoue alors sur une contrainte de clé
 * étrangère (une base neuve, elle, passe : d'où un vert trompeur).
 *
 * On désactive donc les clés étrangères AVANT la transaction du migrateur
 * (hors transaction, le pragma est effectif et reste en vigueur pendant
 * celle-ci), puis on rétablit l'état précédent. Les lignes étant recopiées à
 * l'identique (mêmes `id`), les clés restent cohérentes après migration.
 */
export function runMigrations(
	sqlite: Database.Database,
	migrationsFolder: string = MIGRATIONS_FOLDER
): void {
	const foreignKeysWereOn = sqlite.pragma('foreign_keys', { simple: true }) === 1;
	sqlite.pragma('foreign_keys = OFF');
	try {
		migrate(drizzle(sqlite), { migrationsFolder });
	} finally {
		sqlite.pragma(`foreign_keys = ${foreignKeysWereOn ? 'ON' : 'OFF'}`);
	}
}
