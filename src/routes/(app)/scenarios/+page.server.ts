import { redirect } from '@sveltejs/kit';
import {
	availableFilterValues,
	filterScenarios,
	listScenarioSummaries,
	readFilters
} from '$lib/server/scenarios/listing';
import type { PageServerLoad } from './$types';

/**
 * Catalogue en lecture seule. Les scénarios sont globaux (pas de tenantId) ;
 * aucune donnée de campagne n'est lue ici (pas de compteur d'utilisation).
 * Authentification : garde de `(app)/+layout.server.ts`, doublée ici.
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
