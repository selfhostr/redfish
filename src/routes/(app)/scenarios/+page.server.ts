import { fail, redirect } from '@sveltejs/kit';
import { audit } from '$lib/server/audit';
import { BundleImportError, importBundle } from '$lib/server/scenarios/bundle';
import {
	availableFilterValues,
	filterScenarios,
	listScenarioSummaries,
	readFilters
} from '$lib/server/scenarios/listing';
import type { Actions, PageServerLoad } from './$types';

/**
 * Vos scénarios (créés ou importés). Le dépôt ne livre aucun scénario : cette
 * liste est vide tant que le superadmin n'en a pas créé ou importé. Les scénarios
 * sont globaux (pas de tenantId) ; aucune donnée de campagne n'est lue ici (pas
 * de compteur d'utilisation). Authentification : garde de
 * `(app)/+layout.server.ts`, doublée ici.
 */
export const load: PageServerLoad = async ({ locals, url }) => {
	if (!locals.user) throw redirect(303, '/login');
	const all = listScenarioSummaries();
	const filters = readFilters(url.searchParams);
	return {
		scenarios: filterScenarios(all, filters),
		total: all.length,
		filters,
		available: availableFilterValues(all)
	};
};

export const actions: Actions = {
	/**
	 * Importe un scénario depuis un fichier JSON téléversé (multipart, champ
	 * « file ») ou un champ texte JSON (« json »). Un scénario importé est GLOBAL :
	 * comme les profils d'envoi globaux, l'action est réservée au superadmin.
	 * Toutes les validations de sécurité sont appliquées par `importBundle` ;
	 * une entrée invalide renvoie `fail(400)` avec un message affichable.
	 */
	import: async ({ request, locals }) => {
		const user = locals.user;
		if (!user) return fail(401, { error: 'Non authentifié' });
		if (user.role !== 'superadmin') return fail(403, { error: 'Import réservé au superadmin' });

		const data = await request.formData();
		const file = data.get('file');
		const text =
			file instanceof File && file.size > 0
				? await file.text()
				: String(data.get('json') ?? '').trim();
		if (!text) return fail(400, { error: 'Aucun fichier ni JSON fourni.' });

		try {
			const { key } = await importBundle(text);
			audit(user, 'scenario.import', { targetType: 'scenario', targetId: key });
			return { success: true, key };
		} catch (e) {
			if (e instanceof BundleImportError) return fail(400, { error: e.message });
			return fail(400, { error: e instanceof Error ? e.message : 'Import impossible.' });
		}
	}
};
