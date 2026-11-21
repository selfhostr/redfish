import { error, redirect } from '@sveltejs/kit';
import { getScenario } from '$lib/server/scenarios/loader';
import { renderScenarioPreview } from '$lib/server/scenarios/preview';
import { toSummary } from '$lib/server/scenarios/listing';
import type { PageServerLoad } from './$types';

/**
 * Aperçu « maquette » d'un scénario. Les scénarios sont globaux ; aucune donnée
 * de campagne n'est lue. Le chemin disque n'est jamais exposé. Authentification :
 * garde de `(app)/+layout.server.ts`, doublée ici.
 */
export const load: PageServerLoad = async ({ locals, params }) => {
	if (!locals.user) throw redirect(303, '/login');
	const scenario = getScenario(params.key);
	if (!scenario) throw error(404, 'Scénario introuvable');
	const { id: _id, ...summary } = toSummary(scenario);
	const preview = await renderScenarioPreview(scenario);
	return {
		scenario: summary,
		preview
	};
};
