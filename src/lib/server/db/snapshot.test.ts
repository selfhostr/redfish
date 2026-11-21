import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, expect, test } from 'vitest';
import { runMigrations } from './migrate';
import { parseKeep, rotateSnapshots, snapshotBeforeMigrate } from './snapshot';

const dirs: string[] = [];
afterEach(() => {
	for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function tmp(): string {
	const d = mkdtempSync(join(tmpdir(), 'redfish-snap-'));
	dirs.push(d);
	return d;
}

const quiet = () => {};

test('base neuve : aucun instantané', () => {
	const dir = tmp();
	const db = new Database(join(dir, 'r.db'));
	expect(snapshotBeforeMigrate(db, { dbPath: join(dir, 'r.db'), keep: 3 }, quiet)).toBeNull();
	expect(existsSync(join(dir, 'snapshots'))).toBe(false);
	db.close();
});

test('base à jour : aucun instantané', () => {
	const dir = tmp();
	const db = new Database(join(dir, 'r.db'));
	runMigrations(db);
	expect(snapshotBeforeMigrate(db, { dbPath: join(dir, 'r.db'), keep: 3 }, quiet)).toBeNull();
	db.close();
});

test('migrations en attente : instantané créé et lisible ; désactivé avec keep=0', () => {
	const dir = tmp();
	const db = new Database(join(dir, 'r.db'));
	runMigrations(db);
	db.prepare(
		'DELETE FROM __drizzle_migrations WHERE created_at = (SELECT MAX(created_at) FROM __drizzle_migrations)'
	).run();
	expect(snapshotBeforeMigrate(db, { dbPath: join(dir, 'r.db'), keep: 0 }, quiet)).toBeNull();
	const snap = snapshotBeforeMigrate(db, { dbPath: join(dir, 'r.db'), keep: 3 }, quiet);
	expect(snap).not.toBeNull();
	const copy = new Database(snap!, { readonly: true });
	expect(copy.pragma('integrity_check', { simple: true })).toBe('ok');
	copy.close();
	db.close();
});

test('rotation : ne garde que les N plus récents', () => {
	const dir = tmp();
	mkdirSync(dir, { recursive: true });
	for (const d of ['01', '02', '03', '04', '05'])
		writeFileSync(join(dir, `r.db.pre-migrate-2026-01-${d}.db`), '');
	writeFileSync(join(dir, 'autre.txt'), '');
	rotateSnapshots(dir, 'r.db', 2);
	expect(readdirSync(dir).sort()).toEqual([
		'autre.txt',
		'r.db.pre-migrate-2026-01-04.db',
		'r.db.pre-migrate-2026-01-05.db'
	]);
});

test('parseKeep', () => {
	expect(parseKeep(undefined)).toBe(3);
	expect(parseKeep('0')).toBe(0);
	expect(parseKeep('5')).toBe(5);
	expect(parseKeep('x')).toBe(3);
});

function pending(dir: string) {
	const db = new Database(join(dir, 'r.db'));
	runMigrations(db);
	db.prepare(
		'DELETE FROM __drizzle_migrations WHERE created_at = (SELECT MAX(created_at) FROM __drizzle_migrations)'
	).run();
	return db;
}

test('chemin avec apostrophes : lié en paramètre, aucune injection', () => {
	const dir = tmp();
	const db = pending(dir);
	const weird = join(dir, "x'; DROP TABLE __drizzle_migrations; --");
	const snap = snapshotBeforeMigrate(db, { dbPath: join(dir, 'r.db'), dir: weird }, quiet);
	expect(existsSync(snap!)).toBe(true);
	expect(db.prepare('SELECT COUNT(*) AS n FROM __drizzle_migrations').get()).toMatchObject({});
	db.close();
});

test('échec de l’instantané : l’erreur remonte (la migration est abandonnée)', () => {
	const dir = tmp();
	const db = pending(dir);
	const blocker = join(dir, 'fichier');
	writeFileSync(blocker, '');
	// `dir` pointe sous un fichier ordinaire : création du dossier impossible.
	expect(() =>
		snapshotBeforeMigrate(db, { dbPath: join(dir, 'r.db'), dir: join(blocker, 'sub') }, quiet)
	).toThrow();
	db.close();
});
