import { and, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { campaignRecipients, campaigns, events, targets } from '$lib/server/db/schema';
import { qualifyScanner } from './scanner';

/** Types d'événements enregistrables depuis les endpoints publics `/t`. */
export type RecordableEventType =
	'opened' | 'clicked' | 'page_interaction' | 'form_submitted' | 'awareness_viewed' | 'reported';

/** Options d'enregistrement : user-agent (en-tête) et horloge injectable (tests). */
export type RecordEventOptions = { ua?: string | null; now?: Date };

/**
 * Enregistre qu'un événement de tracking a eu lieu pour le destinataire désigné
 * par `token`. Résout le destinataire par son jeton opaque ; si le jeton est
 * inconnu, n'insère RIEN et renvoie `false`. Sinon insère un `Event` du type
 * demandé, qualifié (`uaCategory` grossier + `isAutomated`) via
 * {@link qualifyScanner} à partir du user-agent et du délai depuis l'envoi.
 *
 * GARANTIE « ZÉRO CAPTURE » : cette fonction ne lit ni ne stocke JAMAIS le corps
 * d'une requête ni la moindre valeur saisie par la cible. Elle ne reçoit que le
 * jeton, le type et, au plus, l'en-tête user-agent — réduit à une catégorie.
 */
export async function recordEvent(
	token: string,
	type: RecordableEventType,
	opts: RecordEventOptions = {}
): Promise<boolean> {
	const recipient = db
		.select()
		.from(campaignRecipients)
		.where(eq(campaignRecipients.token, token))
		.get();
	if (!recipient) return false;

	// Campagne clôturée : ses statistiques sont figées (elles alimentent tendances
	// et rapports). Le jeton reste valide (la page de sensibilisation s'affiche),
	// mais plus aucun événement n'est enregistré.
	const campaign = db
		.select({ status: campaigns.status })
		.from(campaigns)
		.where(eq(campaigns.id, recipient.campaignId))
		.get();
	if (campaign?.status === 'completed') return true;

	const now = opts.now ?? new Date();

	// Délai depuis l'envoi : d'abord l'horodatage de l'événement SENT, sinon
	// `sentAt` du destinataire quand il est disponible.
	const sentEvent = db
		.select()
		.from(events)
		.where(and(eq(events.campaignRecipientId, recipient.id), eq(events.type, 'sent')))
		.get();
	const sentAt = sentEvent?.createdAt ?? recipient.sentAt ?? null;
	const msSinceSent = sentAt ? now.getTime() - sentAt.getTime() : null;

	const { uaCategory, isAutomated } = qualifyScanner(opts.ua ?? null, msSinceSent);

	// Plafond anti-croissance : au plus UNE ligne par (destinataire, type,
	// isAutomated). Les entonnoirs comptent des destinataires distincts, donc la
	// première occurrence (humaine et automatisée séparément) suffit ; les
	// répétitions (jeton divulgué, rechargements) n'insèrent rien. Vaut aussi
	// pour `reported` : un signalement automate ne masque pas un vrai signalement.
	const duplicate = db
		.select({ id: events.id })
		.from(events)
		.where(
			and(
				eq(events.campaignRecipientId, recipient.id),
				eq(events.type, type),
				eq(events.isAutomated, isAutomated)
			)
		)
		.get();
	if (duplicate) return true;

	db.insert(events)
		.values({ campaignRecipientId: recipient.id, type, uaCategory, isAutomated, createdAt: now })
		.run();

	return true;
}

/**
 * Saisie manuelle par l'opérateur : enregistre `reported` pour les destinataires
 * de la campagne dont l'adresse figure dans `emails` (comparaison insensible à la
 * casse). Idempotent (pas de doublon si déjà signalé par un humain). Renvoie les
 * adresses reconnues et celles qui ne correspondent à aucun destinataire.
 */
export function recordManualReports(
	campaignId: string,
	emails: string[]
): { matched: string[]; unmatched: string[] } {
	const rows = db
		.select({ id: campaignRecipients.id, email: targets.email })
		.from(campaignRecipients)
		.innerJoin(targets, eq(campaignRecipients.targetId, targets.id))
		.where(eq(campaignRecipients.campaignId, campaignId))
		.all();
	const byEmail = new Map(rows.map((r) => [r.email.trim().toLowerCase(), r.id]));
	const matched: string[] = [];
	const unmatched: string[] = [];
	const seen = new Set<string>();
	for (const raw of emails) {
		const email = raw.trim().toLowerCase();
		if (!email || seen.has(email)) continue;
		seen.add(email);
		const rid = byEmail.get(email);
		if (!rid) {
			unmatched.push(email);
			continue;
		}
		matched.push(email);
		const already = db
			.select({ id: events.id })
			.from(events)
			.where(
				and(
					eq(events.campaignRecipientId, rid),
					eq(events.type, 'reported'),
					eq(events.isAutomated, false)
				)
			)
			.get();
		if (!already)
			db.insert(events)
				.values({
					campaignRecipientId: rid,
					type: 'reported',
					uaCategory: 'operator',
					isAutomated: false,
					createdAt: new Date()
				})
				.run();
	}
	return { matched, unmatched };
}
