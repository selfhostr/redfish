/** Décision de navigation du faux webmail (fonction pure, testable sans DOM). */

export type PreviewStep = 'landing' | 'awareness' | 'none';

/**
 * Marqueur posé par l'assainisseur d'aperçu sur les seuls éléments actifs : le
 * HTML d'aperçu ne contient aucun `href`, la navigation est décidée ici.
 */
export const PREVIEW_MARKER_ATTR = 'data-rf-preview';

export const PREVIEW_MARKERS = {
	/** Lien de l'e-mail vers la page de destination (ancien lien de tracking). */
	click: 'click',
	/** Contrôle d'envoi d'un formulaire (`button` d'envoi, `input` submit/image). */
	submit: 'submit'
} as const;

export type ClickInfo = {
	/** Nom de balise de l'élément marqué le plus proche de la cible du clic. */
	tag: string;
	/** Valeur de l'attribut {@link PREVIEW_MARKER_ATTR} (absent : `null`). */
	marker?: string | null;
	/** Attribut type brut (button, input). */
	type?: string | null;
	/** L'élément est situé dans un `form`. */
	insideForm: boolean;
};

/**
 * Contrôle qui soumettrait son formulaire : `button` sauf `type` button/reset
 * (type absent ou invalide = submit), `input` de type submit ou image. Comme le
 * navigateur : comparaison insensible à la casse ASCII, sans suppression des blancs.
 */
export function isSubmitControl(tag: string, type?: string | null): boolean {
	const t = tag.toLowerCase();
	const ty = (type ?? '').replace(/[A-Z]/g, (c) => c.toLowerCase());
	if (t === 'button') return ty !== 'button' && ty !== 'reset';
	if (t === 'input') return ty === 'submit' || ty === 'image';
	return false;
}

/**
 * Marqueur `click` : page de destination. Marqueur `submit` sur un contrôle
 * d'envoi situé dans un formulaire : page de sensibilisation. Tout le reste
 * (élément non marqué, bouton `button`/`reset`, hors formulaire) : rien.
 */
export function decideNav(info: ClickInfo): PreviewStep {
	if (info.marker === PREVIEW_MARKERS.click) return 'landing';
	if (
		info.marker === PREVIEW_MARKERS.submit &&
		info.insideForm &&
		isSubmitControl(info.tag, info.type)
	) {
		return 'awareness';
	}
	return 'none';
}
