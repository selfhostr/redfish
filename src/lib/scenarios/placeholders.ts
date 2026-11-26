/**
 * Variables `{{clé}}` reconnues par le pipeline de rendu, gabarit par gabarit.
 * Source de vérité partagée entre l'éditeur (barre d'insertion, côté client) et
 * l'aperçu (signalement des variables inconnues, côté serveur). Doit refléter
 * exactement les substitutions de `$lib/server/scenarios/render` : une clé
 * absente de ces listes y devient une chaîne vide.
 */

export type TemplateField = 'subject' | 'email' | 'landing' | 'awareness' | 'attachment';

export type PlaceholderInfo = {
	key: string;
	/** Infobulle courte affichée sur le bouton d'insertion. */
	hint: string;
};

const FIRST_NAME: PlaceholderInfo = { key: 'firstName', hint: 'Prénom du destinataire' };
const AWARENESS_MESSAGE: PlaceholderInfo = {
	key: 'awarenessMessage',
	hint: 'Note de sensibilisation de la campagne'
};
const BEACON_URL: PlaceholderInfo = {
	key: 'beaconUrl',
	hint: "URL du beacon (signale l'affichage, jamais la saisie)"
};

export const TEMPLATE_PLACEHOLDERS: Record<TemplateField, readonly PlaceholderInfo[]> = {
	subject: [
		FIRST_NAME,
		{ key: 'lastName', hint: 'Nom du destinataire' },
		{ key: 'email', hint: 'Adresse e-mail du destinataire' }
	],
	email: [
		FIRST_NAME,
		{ key: 'clickUrl', hint: 'Lien suivi vers la page de destination' },
		{ key: 'openUrl', hint: "URL du pixel d'ouverture" },
		{ key: 'reportUrl', hint: 'Lien « Signaler ce message » (enregistre un signalement)' },
		{
			key: 'qrCode',
			hint: 'QR code encodant le lien de clic (quishing) ; actif si « Insérer un QR code »'
		}
	],
	landing: [
		FIRST_NAME,
		AWARENESS_MESSAGE,
		{ key: 'submitUrl', hint: 'Action du formulaire (rien n’est envoyé)' },
		BEACON_URL
	],
	awareness: [FIRST_NAME, AWARENESS_MESSAGE, BEACON_URL],
	attachment: [
		FIRST_NAME,
		{
			key: 'attachmentOpen',
			hint: "URL du beacon d'ouverture de la PJ HTML (signale l'ouverture, jamais la saisie)"
		}
	]
};

/** Libellés français des gabarits, pour les messages d'erreur. */
export const TEMPLATE_LABELS: Record<TemplateField, string> = {
	subject: 'Sujet',
	email: 'E-mail',
	landing: 'Page de destination',
	awareness: 'Page de sensibilisation',
	attachment: 'Pièce jointe'
};

/** Même motif que la substitution du rendu. */
const PLACEHOLDER_RE = /\{\{\s*(\w+)\s*\}\}/g;

/**
 * Variables `{{clé}}` présentes dans `src` mais inconnues pour ce gabarit (elles
 * seraient rendues vides). Sans doublon, dans l'ordre d'apparition.
 */
export function findUnknownPlaceholders(src: string, field: TemplateField): string[] {
	const valid = new Set(TEMPLATE_PLACEHOLDERS[field].map((p) => p.key));
	const unknown: string[] = [];
	for (const match of src.matchAll(PLACEHOLDER_RE)) {
		const key = match[1];
		if (!valid.has(key) && !unknown.includes(key)) unknown.push(key);
	}
	return unknown;
}
