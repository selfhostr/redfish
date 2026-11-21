import { createHash } from 'node:crypto';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { campaignRecipients, campaigns, events, targetLists, targets } from '$lib/server/db/schema';
import type { Target } from '$lib/server/db/schema';
import { isValidEmail, isValidLocale, normalizeEmail } from '$lib/server/targets';
import type { TargetInput } from '$lib/server/targets';

type Tx = Pick<typeof db, 'select' | 'update' | 'delete'>;

/** Identifiant d'audit d'une personne : haché, l'e-mail n'est jamais journalisé. */
export function personRef(tenantId: string, email: string): string {
	return createHash('sha256')
		.update(`${tenantId}:${normalizeEmail(email)}`)
		.digest('hex')
		.slice(0, 16);
}

function ownTarget(tx: Tx, tenantId: string, targetId: string): Target {
	const t = tx
		.select()
		.from(targets)
		.where(and(eq(targets.id, targetId), eq(targets.tenantId, tenantId)))
		.get();
	if (!t) throw new Error('Cible introuvable');
	return t;
}

function hasParticipation(tx: Tx, targetId: string): boolean {
	return !!tx
		.select({ id: campaignRecipients.id })
		.from(campaignRecipients)
		.where(eq(campaignRecipients.targetId, targetId))
		.get();
}

/** Anonymise une cible comme la rétention : PII effacée, destinataires et événements conservés. */
export function anonymizeTargetRow(tx: Tx, id: string, now = new Date()): void {
	tx.update(targets)
		.set({
			firstName: '',
			lastName: '',
			email: `redacted-${id}@redacted.invalid`,
			department: null,
			anonymizedAt: now
		})
		.where(eq(targets.id, id))
		.run();
}

export async function updateTarget(
	tenantId: string,
	targetId: string,
	input: TargetInput
): Promise<Target> {
	const t = ownTarget(db, tenantId, targetId);
	if (t.anonymizedAt) throw new Error('Cible anonymisée : modification impossible');
	const email = normalizeEmail(input.email);
	if (!isValidEmail(email)) throw new Error(`E-mail invalide : ${email}`);
	const locale = input.locale?.trim().toLowerCase() || null;
	if (locale && !isValidLocale(locale)) throw new Error(`Locale invalide : ${locale}`);
	if (email !== t.email) {
		const dup = db
			.select({ id: targets.id })
			.from(targets)
			.where(and(eq(targets.listId, t.listId), eq(targets.email, email)))
			.get();
		if (dup) throw new Error(`E-mail déjà présent : ${email}`);
	}
	return db
		.update(targets)
		.set({
			email,
			firstName: input.firstName?.trim() ?? '',
			lastName: input.lastName?.trim() ?? '',
			department: input.department?.trim() || null,
			locale
		})
		.where(eq(targets.id, targetId))
		.returning()
		.get();
}

/** Supprime une cible jamais utilisée en campagne ; sinon il faut l'anonymiser. */
export async function deleteTarget(tenantId: string, targetId: string): Promise<void> {
	ownTarget(db, tenantId, targetId);
	if (hasParticipation(db, targetId))
		throw new Error('Cible utilisée dans des campagnes : anonymisez-la plutôt');
	db.delete(targets).where(eq(targets.id, targetId)).run();
}

export async function anonymizeTarget(tenantId: string, targetId: string): Promise<void> {
	const t = ownTarget(db, tenantId, targetId);
	if (t.anonymizedAt) return;
	anonymizeTargetRow(db, targetId);
}

function findByEmail(tx: Tx, tenantId: string, email: string): Target[] {
	return tx
		.select()
		.from(targets)
		.where(and(eq(targets.tenantId, tenantId), eq(targets.email, normalizeEmail(email))))
		.all();
}

export async function findPerson(tenantId: string, email: string) {
	const lists = new Map(
		db
			.select()
			.from(targetLists)
			.where(eq(targetLists.tenantId, tenantId))
			.all()
			.map((l) => [l.id, l.name])
	);
	return findByEmail(db, tenantId, email).map((t) => ({
		id: t.id,
		listId: t.listId,
		listName: lists.get(t.listId) ?? '',
		firstName: t.firstName,
		lastName: t.lastName,
		department: t.department
	}));
}

/** Export d'accès (droit d'accès) : tout ce qui est stocké sur la personne, dans ce client. */
export async function exportPerson(tenantId: string, email: string) {
	const rows = findByEmail(db, tenantId, email);
	const lists = new Map(
		db
			.select()
			.from(targetLists)
			.where(eq(targetLists.tenantId, tenantId))
			.all()
			.map((l) => [l.id, l.name])
	);
	return {
		exportedAt: new Date().toISOString(),
		email: normalizeEmail(email),
		targets: rows.map((t) => {
			const recipients = db
				.select({
					campaignId: campaigns.id,
					campaignName: campaigns.name,
					campaignStatus: campaigns.status,
					recipientId: campaignRecipients.id,
					sendStatus: campaignRecipients.sendStatus,
					sentAt: campaignRecipients.sentAt
				})
				.from(campaignRecipients)
				.innerJoin(campaigns, eq(campaigns.id, campaignRecipients.campaignId))
				.where(and(eq(campaignRecipients.targetId, t.id), eq(campaigns.tenantId, tenantId)))
				.all();
			const evs = recipients.length
				? db
						.select()
						.from(events)
						.where(
							inArray(
								events.campaignRecipientId,
								recipients.map((r) => r.recipientId)
							)
						)
						.all()
				: [];
			return {
				id: t.id,
				list: { id: t.listId, name: lists.get(t.listId) ?? '' },
				firstName: t.firstName,
				lastName: t.lastName,
				email: t.email,
				department: t.department,
				locale: t.locale,
				createdAt: t.createdAt.toISOString(),
				anonymizedAt: t.anonymizedAt?.toISOString() ?? null,
				campaigns: recipients.map((r) => ({
					campaignId: r.campaignId,
					campaignName: r.campaignName,
					campaignStatus: r.campaignStatus,
					sendStatus: r.sendStatus,
					sentAt: r.sentAt?.toISOString() ?? null,
					events: evs
						.filter((e) => e.campaignRecipientId === r.recipientId)
						.map((e) => ({
							type: e.type,
							uaCategory: e.uaCategory,
							isAutomated: e.isAutomated,
							at: e.createdAt.toISOString()
						}))
				}))
			};
		})
	};
}

/**
 * Effacement d'une personne dans le client : cibles jamais utilisées supprimées,
 * les autres anonymisées (statistiques agrégées préservées).
 */
export async function erasePerson(
	tenantId: string,
	email: string
): Promise<{ deleted: number; anonymized: number }> {
	let deleted = 0;
	let anonymized = 0;
	db.transaction((tx) => {
		for (const t of findByEmail(tx, tenantId, email)) {
			if (hasParticipation(tx, t.id)) {
				anonymizeTargetRow(tx, t.id);
				anonymized++;
			} else {
				tx.delete(targets).where(eq(targets.id, t.id)).run();
				deleted++;
			}
		}
	});
	return { deleted, anonymized };
}
