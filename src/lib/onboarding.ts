export type OnboardingCounts = { listCount: number; profileCount: number; campaignCount: number };

/** Étapes des « Premiers pas » d'un client. */
export function onboardingSteps(c: OnboardingCounts) {
	return [
		{ done: c.listCount > 0, label: 'Créer une liste de destinataires', href: '/lists' },
		{ done: c.profileCount > 0, label: "Ajouter un profil d'envoi", href: '/sending-profiles' },
		{ done: c.campaignCount > 0, label: 'Lancer une première campagne', href: '/campaigns/new' }
	];
}

/**
 * « Premiers pas » affichés seulement pour un client qui n'a pas encore commencé :
 * dès sa première campagne, le tableau de bord montre ses résultats à la place.
 */
export function showOnboarding(c: OnboardingCounts): boolean {
	const onboarded = onboardingSteps(c).every((s) => s.done);
	return !onboarded && c.campaignCount === 0;
}
