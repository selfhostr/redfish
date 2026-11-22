import { parseZonedDateTime } from '$lib/server/datetime';

export type AuthorizationInputResult =
	{ error: string } | { reference: string; approvedBy: string; validFrom: Date; validUntil: Date };

/**
 * Valide les champs d'autorisation d'un formulaire, un par un, et renvoie un
 * message précis pour le premier champ en défaut.
 */
export function parseAuthorizationFields(
	get: (key: string) => string,
	timeZone: string
): AuthorizationInputResult {
	const reference = get('reference');
	const approvedBy = get('approvedBy');
	if (!reference) return { error: "Référence d'autorisation requise." };
	if (!approvedBy) return { error: "Nom de l'approbateur requis." };
	const rawFrom = get('validFrom');
	if (!rawFrom) return { error: 'Date de début requise.' };
	const validFrom = parseZonedDateTime(rawFrom, timeZone);
	if (!validFrom) return { error: 'Date de début invalide.' };
	const rawUntil = get('validUntil');
	if (!rawUntil) return { error: 'Date de fin requise.' };
	const validUntil = parseZonedDateTime(rawUntil, timeZone);
	if (!validUntil) return { error: 'Date de fin invalide.' };
	if (validUntil <= validFrom) return { error: 'La date de fin doit être après la date de début.' };
	return { reference, approvedBy, validFrom, validUntil };
}
