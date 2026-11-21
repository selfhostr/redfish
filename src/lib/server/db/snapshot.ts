import { mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import type Database from 'better-sqlite3';
import { MIGRATIONS_FOLDER } from './migrate';

export type SnapshotOptions = {
	/** Fichier de la base. */
	dbPath: string;
	/** Dossier des instantanés (défaut : `<dossier de la base>/snapshots`). */
	dir?: string;
	/** Nombre d'instantanés conservés ; 0 désactive la fonction. */
	keep?: number;
	migrationsFolder?: string;
};

export const DEFAULT_KEEP = 3;

/** Lit `MIGRATE_SNAPSHOT_KEEP` : entier >= 0 (0 = désactivé), sinon défaut. */
export function parseKeep(raw: string | undefined): number {
	if (raw === undefined || raw.trim() === '') return DEFAULT_KEEP;
	const n = Number(raw);
	return Number.isInteger(n) && n >= 0 ? n : DEFAULT_KEEP;
}

function hasMigrationsTable(sqlite: Database.Database): boolean {
	return !!sqlite
		.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='__drizzle_migrations'")
		.get();
}

/** Vrai si le journal Drizzle contient des migrations non encore appliquées. */
export function hasPendingMigrations(
	sqlite: Database.Database,
	migrationsFolder: string = MIGRATIONS_FOLDER
): boolean {
	const journal = JSON.parse(
		readFileSync(join(migrationsFolder, 'meta', '_journal.json'), 'utf8')
	) as { entries: { when: number }[] };
	if (!hasMigrationsTable(sqlite)) return journal.entries.length > 0;
	const last = sqlite.prepare('SELECT MAX(created_at) AS m FROM __drizzle_migrations').get() as {
		m: number | null;
	};
	const applied = last.m ?? -1;
	return journal.entries.some((e) => e.when > applied);
}

/** Supprime les instantanés les plus anciens au-delà de `keep`. */
export function rotateSnapshots(dir: string, dbName: string, keep: number): string[] {
	const prefix = `${dbName}.pre-migrate-`;
	const files = readdirSync(dir)
		.filter((f) => f.startsWith(prefix) && f.endsWith('.db'))
		.sort(); // horodatage ISO : l'ordre lexical est chronologique
	const old = files.slice(0, Math.max(0, files.length - keep));
	for (const f of old) rmSync(join(dir, f), { force: true });
	return old;
}

/**
 * Prend un instantané cohérent (`VACUUM INTO`) avant migration, seulement si la
 * base a déjà été migrée, qu'elle a des migrations en attente et que `keep` > 0.
 * Retourne le chemin de l'instantané, ou null si rien n'a été fait.
 */
export function snapshotBeforeMigrate(
	sqlite: Database.Database,
	opts: SnapshotOptions,
	log: (msg: string) => void = console.log
): string | null {
	const keep = opts.keep ?? DEFAULT_KEEP;
	if (keep <= 0) {
		log('pre-migration snapshot disabled (MIGRATE_SNAPSHOT_KEEP=0)');
		return null;
	}
	// Base neuve ou jamais migrée : rien à protéger.
	if (!hasMigrationsTable(sqlite)) return null;
	if (!hasPendingMigrations(sqlite, opts.migrationsFolder ?? MIGRATIONS_FOLDER)) return null;

	const dir = opts.dir ?? join(dirname(opts.dbPath), 'snapshots');
	mkdirSync(dir, { recursive: true });
	const name = basename(opts.dbPath);
	const stamp = new Date().toISOString().replace(/[:.]/g, '-');
	const target = join(dir, `${name}.pre-migrate-${stamp}.db`);
	// Le chemin est lié en paramètre (jamais concaténé dans le SQL) : pas d'injection
	// possible via MIGRATE_SNAPSHOT_DIR. Un échec REMONTE (la migration est abandonnée :
	// mieux vaut ne pas migrer que migrer sans filet) et on retire un fichier partiel.
	try {
		sqlite.prepare('VACUUM INTO ?').run(target);
	} catch (e) {
		rmSync(target, { force: true });
		throw e;
	}
	log(`pre-migration snapshot written: ${target}`);
	// La rotation est un nettoyage : son échec ne doit pas bloquer la migration.
	try {
		const removed = rotateSnapshots(dir, name, keep);
		if (removed.length) log(`old snapshots removed: ${removed.length} (keeping ${keep})`);
	} catch (e) {
		log(`snapshot rotation failed (ignored): ${e instanceof Error ? e.message : e}`);
	}
	return target;
}
