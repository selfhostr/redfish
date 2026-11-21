import { randomUUID } from 'node:crypto';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { afterEach, expect, test } from 'vitest';
import { runMigrations } from './migrate';

type Journal = {
	version: string;
	dialect: string;
	entries: { idx: number; tag: string; when: number; breakpoints: boolean; version: string }[];
};

/**
 * Construit un dossier de migrations limité à 0000..0002, c.-à-d. l'état du
 * schéma AVANT l'ajout de la colonne `scenarios.source` par 0003. Les
 * migrations y sont réelles : `migrate()` les enregistre dans
 * `__drizzle_migrations`, si bien qu'un `migrate()` ultérieur sur le dossier
 * complet n'appliquera que 0003 (comme à la mise à jour d'une instance).
 */
function buildSchema0002Folder(): string {
	const journal = JSON.parse(readFileSync('drizzle/meta/_journal.json', 'utf8')) as Journal;
	const entries = journal.entries.filter((e) => e.idx <= 2);
	const dir = mkdtempSync(join(tmpdir(), 'redfish-mig-'));
	mkdirSync(join(dir, 'meta'), { recursive: true });
	for (const e of entries) copyFileSync(join('drizzle', `${e.tag}.sql`), join(dir, `${e.tag}.sql`));
	writeFileSync(join(dir, 'meta', '_journal.json'), JSON.stringify({ ...journal, entries }));
	return dir;
}

let tempDirs: string[] = [];
afterEach(() => {
	for (const d of tempDirs) rmSync(d, { recursive: true, force: true });
	tempDirs = [];
});

test('0003 migrates a populated database without breaking foreign keys', () => {
	const baseFolder = buildSchema0002Folder();
	tempDirs.push(baseFolder);

	const sqlite = new Database(':memory:');
	sqlite.pragma('foreign_keys = ON');

	// 1. Base au schéma 0002 (migrations réelles, enregistrées dans __drizzle_migrations).
	migrate(drizzle(sqlite), { migrationsFolder: baseFolder });

	// 2. Données cohérentes, dont une campagne qui référence le scénario.
	const tenantId = randomUUID();
	const scenarioId = randomUUID();
	const profileId = randomUUID();
	const listId = randomUUID();
	const campaignId = randomUUID();
	sqlite.prepare('INSERT INTO tenants (id, name) VALUES (?, ?)').run(tenantId, 'Alpina SA');
	sqlite
		.prepare(
			'INSERT INTO scenarios (id, key, title, category, locale, difficulty, path) VALUES (?, ?, ?, ?, ?, ?, ?)'
		)
		.run(scenarioId, 'phish-invoice', 'Fausse facture', 'finance', 'fr', 'easy', 'builtin/invoice');
	sqlite
		.prepare(
			'INSERT INTO sending_profiles (id, name, host, port, username, password_enc, from_name, from_address) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
		)
		.run(profileId, 'SMTP', 'mail.example', 587, 'user', 'enc', 'Compta', 'compta@example.ch');
	sqlite
		.prepare('INSERT INTO target_lists (id, tenant_id, name) VALUES (?, ?, ?)')
		.run(listId, tenantId, 'RH');
	sqlite
		.prepare(
			'INSERT INTO campaigns (id, tenant_id, name, scenario_id, sending_profile_id, target_list_id, tracking_domain) VALUES (?, ?, ?, ?, ?, ?, ?)'
		)
		.run(campaignId, tenantId, 'Q1', scenarioId, profileId, listId, 'track.example');

	// 3. Applique 0003 via le runner du projet (dossier `drizzle` complet).
	expect(() => runMigrations(sqlite)).not.toThrow();

	// 4. La colonne `source` existe, le scénario et la campagne sont intacts, les FK aussi.
	const cols = (sqlite.prepare('PRAGMA table_info(scenarios)').all() as { name: string }[]).map(
		(c) => c.name
	);
	expect(cols).toContain('source');

	const scenario = sqlite.prepare('SELECT id, source FROM scenarios WHERE id = ?').get(scenarioId);
	expect(scenario).toMatchObject({ id: scenarioId, source: 'builtin' });

	const campaign = sqlite.prepare('SELECT scenario_id FROM campaigns WHERE id = ?').get(campaignId);
	expect(campaign).toEqual({ scenario_id: scenarioId });

	expect(sqlite.pragma('foreign_keys', { simple: true })).toBe(1);
	expect(sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([]);

	sqlite.close();
});

test('migrations still apply cleanly on a fresh empty database', () => {
	const sqlite = new Database(':memory:');
	sqlite.pragma('foreign_keys = ON');
	expect(() => runMigrations(sqlite)).not.toThrow();
	const cols = (sqlite.prepare('PRAGMA table_info(scenarios)').all() as { name: string }[]).map(
		(c) => c.name
	);
	expect(cols).toContain('source');
	expect(sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
	sqlite.close();
});
