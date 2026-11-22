export type OnboardingCounts = {
	/** Paramètres du client complétés (voir `clientSettingsDone`). */
	settingsDone: boolean;
	listCount: number;
	profileCount: number;
	campaignCount: number;
};

/**
 * Paramètres du client considérés comme complétés : un contact (e-mail ou nom) est renseigné.
 * Le fuseau horaire a toujours une valeur (défaut du serveur à la création) : il ne peut pas
 * servir de critère, il se vérifie en même temps que le contact.
 */
export function clientSettingsDone(
	tenant: { contactName?: string | null; contactEmail?: string | null } | null | undefined
): boolean {
	return Boolean(tenant?.contactEmail?.trim() || tenant?.contactName?.trim());
}

/** Étapes des « Premiers pas » d'un client, dans l'ordre. */
export function onboardingSteps(c: OnboardingCounts, tenantId = '') {
	return [
		{
			done: c.settingsDone,
			label: 'Compléter les paramètres du client (contact, fuseau)',
			href: tenantId ? `/tenants/${tenantId}` : '/tenants'
		},
		{ done: c.listCount > 0, label: 'Créer une liste de destinataires', href: '/lists' },
		{ done: c.profileCount > 0, label: "Ajouter un profil d'envoi", href: '/sending-profiles' },
		{ done: c.campaignCount > 0, label: 'Lancer une première campagne', href: '/campaigns/new' }
	];
}

/**
 * « Premiers pas » affichés seulement pour un client qui n'a pas encore commencé :
 * dès sa première campagne, le tableau de bord montre ses résultats à la place, même si
 * des étapes restent incomplètes.
 */
export function showOnboarding(c: OnboardingCounts): boolean {
	if (c.campaignCount > 0) return false;
	return !onboardingSteps(c).every((s) => s.done);
}
