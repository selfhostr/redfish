import { parse } from 'csv-parse/sync';
import { and, count, eq, isNull } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { campaigns, targetLists, targets } from '$lib/server/db/schema';
export { EMAIL_NAME_WARNING, looksLikeEmail } from '$lib/email-name';
import type { Target, TargetList } from '$lib/server/db/schema';

export type TargetInput = {
	email: string;
	firstName?: string;
	lastName?: string;
	department?: string | null;
	locale?: string | null;
};

export type ImportResult = { imported: number; skipped: number; errors: string[] };

export const LOCALES = ['fr', 'de', 'it', 'en'] as const;

export function isValidLocale(locale: string): boolean {
	return (LOCALES as readonly string[]).includes(locale);
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(email: string): string {
	return email.trim().toLowerCase();
}

export function isValidEmail(email: string): boolean {
	return EMAIL_RE.test(email);
}

export async function createList(tenantId: string, name: string): Promise<TargetList> {
	return db.insert(targetLists).values({ tenantId, name }).returning().get();
}

/** Listes du tenant ; les archivées sont masquées sauf demande explicite. */
export async function listLists(tenantId: string, includeArchived = false): Promise<TargetList[]> {
	return db
		.select()
		.from(targetLists)
		.where(
			includeArchived
				? eq(targetLists.tenantId, tenantId)
				: and(eq(targetLists.tenantId, tenantId), isNull(targetLists.archivedAt))
		)
		.all();
}

export type ListDeleteOutcome = 'deleted' | 'archived' | 'not_found';

/** Nombre de campagnes qui utilisent cette liste. */
export function countCampaignsUsingList(listId: string): number {
	return db.select({ n: count() }).from(campaigns).where(eq(campaigns.targetListId, listId)).get()!
		.n;
}

/**
 * Supprime une liste du tenant jamais utilisée (ses destinataires avec) ; l'archive
 * si des campagnes l'utilisent, pour ne pas casser l'historique ni les rapports.
 */
export function deleteOrArchiveList(listId: string, tenantId: string): ListDeleteOutcome {
	return db.transaction((tx) => {
		const l = tx
			.select()
			.from(targetLists)
			.where(and(eq(targetLists.id, listId), eq(targetLists.tenantId, tenantId)))
			.get();
		if (!l) return 'not_found';
		const used = tx
			.select({ n: count() })
			.from(campaigns)
			.where(eq(campaigns.targetListId, l.id))
			.get()!.n;
		if (used === 0) {
			// Aucune campagne : aucun envoi, événement ni job ne référence ces cibles.
			tx.delete(targets).where(eq(targets.listId, l.id)).run();
			tx.delete(targetLists).where(eq(targetLists.id, l.id)).run();
			return 'deleted';
		}
		tx.update(targetLists).set({ archivedAt: new Date() }).where(eq(targetLists.id, l.id)).run();
		return 'archived';
	});
}

/** Restaure une liste archivée du tenant. Renvoie false si elle n'existe pas. */
export function restoreList(listId: string, tenantId: string): boolean {
	return (
		db
			.update(targetLists)
			.set({ archivedAt: null })
			.where(and(eq(targetLists.id, listId), eq(targetLists.tenantId, tenantId)))
			.run().changes > 0
	);
}

/** Renomme une liste du tenant. Renvoie false si elle n'existe pas. */
export function renameList(listId: string, tenantId: string, name: string): boolean {
	return (
		db
			.update(targetLists)
			.set({ name })
			.where(and(eq(targetLists.id, listId), eq(targetLists.tenantId, tenantId)))
			.run().changes > 0
	);
}

/** Nombre de cibles par liste du tenant (les listes vides sont absentes de la map). */
export async function countTargetsByList(tenantId: string): Promise<Map<string, number>> {
	const rows = db
		.select({ listId: targets.listId, n: count() })
		.from(targets)
		.where(eq(targets.tenantId, tenantId))
		.groupBy(targets.listId)
		.all();
	return new Map(rows.map((r) => [r.listId, r.n]));
}

/** Liste du tenant, sinon null (jamais d'accès inter-tenant). */
export async function getList(listId: string, tenantId: string): Promise<TargetList | null> {
	return (
		db
			.select()
			.from(targetLists)
			.where(and(eq(targetLists.id, listId), eq(targetLists.tenantId, tenantId)))
			.get() ?? null
	);
}

async function requireList(listId: string, tenantId: string): Promise<void> {
	if (!(await getList(listId, tenantId))) throw new Error('Liste introuvable');
}

export async function listTargets(listId: string, tenantId: string): Promise<Target[]> {
	return db
		.select()
		.from(targets)
		.where(and(eq(targets.listId, listId), eq(targets.tenantId, tenantId)))
		.all();
}

function existingEmails(listId: string): Set<string> {
	return new Set(
		db
			.select({ email: targets.email })
			.from(targets)
			.where(eq(targets.listId, listId))
			.all()
			.map((r) => r.email)
	);
}

function toValues(listId: string, tenantId: string, email: string, i: TargetInput) {
	return {
		listId,
		tenantId,
		email,
		firstName: i.firstName?.trim() ?? '',
		lastName: i.lastName?.trim() ?? '',
		department: i.department?.trim() || null,
		locale: i.locale?.trim().toLowerCase() || null
	};
}

export async function addTarget(
	listId: string,
	tenantId: string,
	input: TargetInput
): Promise<Target> {
	await requireList(listId, tenantId);
	const email = normalizeEmail(input.email);
	if (!isValidEmail(email)) throw new Error(`E-mail invalide : ${email}`);
	const locale = input.locale?.trim().toLowerCase();
	if (locale && !isValidLocale(locale)) throw new Error(`Locale invalide : ${locale}`);
	if (existingEmails(listId).has(email)) throw new Error(`E-mail déjà présent : ${email}`);
	return db
		.insert(targets)
		.values(toValues(listId, tenantId, email, input))
		.returning()
		.get();
}

export async function importCsv(
	listId: string,
	tenantId: string,
	csv: string
): Promise<ImportResult> {
	await requireList(listId, tenantId);
	let rows: Record<string, string>[];
	try {
		rows = parse(csv, {
			columns: (header: string[]) => header.map((h) => h.trim()),
			skip_empty_lines: true,
			relax_column_count: true,
			relax_quotes: true,
			trim: true,
			bom: true
		});
	} catch (e) {
		return { imported: 0, skipped: 0, errors: [`CSV illisible : ${(e as Error).message}`] };
	}
	if (rows.length === 0 || !('email' in rows[0])) {
		return { imported: 0, skipped: 0, errors: ['Colonne "email" absente du CSV'] };
	}

	const seen = existingEmails(listId);
	const toInsert: ReturnType<typeof toValues>[] = [];
	const errors: string[] = [];
	let skipped = 0;
	rows.forEach((row, idx) => {
		const line = idx + 2;
		const email = normalizeEmail(row.email ?? '');
		if (!isValidEmail(email)) {
			skipped++;
			errors.push(`Ligne ${line} : e-mail invalide "${email}"`);
		} else if (row.locale?.trim() && !isValidLocale(row.locale.trim().toLowerCase())) {
			skipped++;
			errors.push(`Ligne ${line} : locale invalide "${row.locale.trim()}"`);
		} else if (seen.has(email)) {
			skipped++;
			errors.push(`Ligne ${line} : doublon "${email}"`);
		} else {
			seen.add(email);
			toInsert.push(toValues(listId, tenantId, email, { ...row, email }));
		}
	});
	if (toInsert.length) db.insert(targets).values(toInsert).run();
	return { imported: toInsert.length, skipped, errors };
}
