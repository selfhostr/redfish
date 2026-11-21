import { and, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { campaignRecipients, events, targets } from '$lib/server/db/schema';
import { toCsv } from './csv';

const HEADER = [
	'email',
	'nom',
	'prenom',
	'anonymise',
	'envoye',
	'ouvert',
	'clique',
	'soumis',
	'signale',
	'date_envoi',
	'date_ouverture',
	'date_clic',
	'date_soumission',
	'date_signalement'
];

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : '');
const yn = (d: Date | null | undefined) => (d ? 'oui' : 'non');

/**
 * Export CSV par cible. Aucune valeur saisie n'est exportée (l'application n'en
 * capture pas). Seuls les événements humains comptent (scanners exclus). Pour une
 * cible anonymisée par la rétention, on exporte ce qui reste (marqueur
 * irréversible, nom vide) sans jamais ré-identifier.
 * L'appelant doit avoir vérifié l'accès au tenant de la campagne.
 */
export function buildResultsCsv(campaignId: string): string {
	const rows = db
		.select({
			id: campaignRecipients.id,
			sentAt: campaignRecipients.sentAt,
			first: targets.firstName,
			last: targets.lastName,
			email: targets.email,
			anonymizedAt: targets.anonymizedAt
		})
		.from(campaignRecipients)
		.innerJoin(targets, eq(campaignRecipients.targetId, targets.id))
		.where(eq(campaignRecipients.campaignId, campaignId))
		.orderBy(campaignRecipients.id)
		.all();
	const evs = db
		.select({ rid: events.campaignRecipientId, type: events.type, at: events.createdAt })
		.from(events)
		.innerJoin(campaignRecipients, eq(events.campaignRecipientId, campaignRecipients.id))
		.where(and(eq(campaignRecipients.campaignId, campaignId), eq(events.isAutomated, false)))
		.all();
	// Premier horodatage humain par destinataire et par type.
	const first = new Map<string, Map<string, Date>>();
	for (const e of evs) {
		const m = first.get(e.rid) ?? first.set(e.rid, new Map()).get(e.rid)!;
		const prev = m.get(e.type);
		if (!prev || e.at < prev) m.set(e.type, e.at);
	}
	const out: (string | null)[][] = [HEADER];
	for (const r of rows) {
		const m = first.get(r.id);
		const sent = r.sentAt;
		const opened = m?.get('opened');
		const clicked = m?.get('clicked');
		const submitted = m?.get('form_submitted');
		const reported = m?.get('reported');
		out.push([
			r.email,
			r.last,
			r.first,
			r.anonymizedAt ? 'oui' : 'non',
			yn(sent),
			yn(opened),
			yn(clicked),
			yn(submitted),
			yn(reported),
			iso(sent),
			iso(opened),
			iso(clicked),
			iso(submitted),
			iso(reported)
		]);
	}
	return toCsv(out);
}
