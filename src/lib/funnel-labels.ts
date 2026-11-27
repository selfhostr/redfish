/** Libellés uniques des étapes de l'entonnoir, partagés par tous les écrans. */
export const funnelLabels = {
	recipients: 'Destinataires',
	sent: 'Envoyés',
	opened: 'Ouverts',
	clicked: 'Clics',
	pageInteraction: 'Interactions page',
	formSubmitted: 'Formulaires soumis',
	awarenessViewed: 'Sensibilisation vue',
	reported: 'Signalés'
} as const;

export type FunnelStage = keyof typeof funnelLabels;

/** Une barre d'entonnoir : libellé, valeur, et note facultative (étape parallèle). */
export type ReportStage = { label: string; value: number; note?: string };

/**
 * Étapes de l'entonnoir d'un rapport, dans l'ordre d'affichage. Partagé par la
 * vue écran et la vue imprimable pour éviter toute divergence. L'ouverture de
 * pièce jointe n'apparaît que si elle a eu lieu : c'est un parcours PARALLÈLE au
 * lien, pas une étape du parcours linéaire.
 */
export function reportFunnelStages(counts: {
	sent: number;
	opened: number;
	clicked: number;
	formSubmitted: number;
	reported: number;
	attachmentOpened: number;
}): ReportStage[] {
	const stages: ReportStage[] = [
		{ label: funnelLabels.sent, value: counts.sent },
		{ label: funnelLabels.opened, value: counts.opened },
		{ label: funnelLabels.clicked, value: counts.clicked },
		{ label: funnelLabels.formSubmitted, value: counts.formSubmitted },
		{ label: funnelLabels.reported, value: counts.reported }
	];
	if (counts.attachmentOpened > 0)
		stages.push({
			label: 'Pièce jointe ouverte',
			value: counts.attachmentOpened,
			note: 'Parcours parallèle au lien'
		});
	return stages;
}
