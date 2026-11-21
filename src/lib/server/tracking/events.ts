import { and, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { campaignRecipients, events } from '$lib/server/db/schema';
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
	// répétitions (jeton divulgué, rechargements) n'insèrent rien.
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
