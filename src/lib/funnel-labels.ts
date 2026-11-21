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
