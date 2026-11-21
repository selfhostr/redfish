import { error, json } from '@sveltejs/kit';
import { exportBundle } from '$lib/server/scenarios/bundle';
import { getScenario } from '$lib/server/scenarios/loader';
import type { RequestHandler } from './$types';

/**
 * Exporte un scénario (builtin ou importé) en un seul fichier JSON téléchargeable.
 * Les scénarios sont globaux ; aucune donnée de campagne n'est lue. Les endpoints
 * `+server` ne passent pas par la garde du layout `(app)` : l'authentification est
 * donc vérifiée ici (session résolue par les hooks dans `locals.user`).
 */
export const GET: RequestHandler = async ({ locals, params }) => {
	if (!locals.user) throw error(401, 'Non authentifié');
	if (!getScenario(params.key)) throw error(404, 'Scénario introuvable');
	const bundle = await exportBundle(params.key);
	return json(bundle, {
		headers: {
			'Content-Disposition': `attachment; filename="redfish-scenario-${params.key}.json"`
		}
	});
};
