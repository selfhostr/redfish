import { error, fail, redirect } from '@sveltejs/kit';
import { audit } from '$lib/server/audit';
import {
	BUNDLE_SCHEMA_VERSION,
	BundleImportError,
	importBundle
} from '$lib/server/scenarios/bundle';
import { getScenario } from '$lib/server/scenarios/loader';
import { loadScenarioContent } from '$lib/server/scenarios/render';
import { parseTags } from '$lib/scenario-labels';
import type { Scenario } from '$lib/server/db/schema';
import type { Actions, PageServerLoad } from './$types';

/**
 * Édition en place d'un scénario importé (superadmin). Réutilise exactement le
 * flux de création : les champs du formulaire sont assemblés en bundle et confiés
 * à `importBundle`, qui met à jour le scénario importé existant et applique toutes
 * les validations de sécurité (dont l'invariant « zéro capture »).
 *
 * Deux garde-fous propres à l'édition :
 * - la clé ne change pas (on force `bundle.key = params.key`, toute clé soumise
 *   est ignorée) ;
 * - un scénario livré (builtin) est en lecture seule et ne peut pas être écrasé.
 */

const READ_ONLY =
	'Ce scénario est en lecture seule (livré). Dupliquez-le via Exporter puis Importer.';

/** Un scénario importé (donc éditable) : ni builtin, ni adossé à un dossier disque. */
function ensureEditable(scenario: Scenario): void {
	if (scenario.source === 'builtin' || scenario.path !== null) throw error(403, READ_ONLY);
}

export const load: PageServerLoad = async ({ locals, params }) => {
	if (!locals.user) throw redirect(303, '/login');
	if (locals.user.role !== 'superadmin') throw error(403, 'Modification réservée au superadmin');

	const scenario = getScenario(params.key);
	if (!scenario) throw error(404, 'Scénario introuvable');
	ensureEditable(scenario);

	const content = await loadScenarioContent(scenario);
	return {
		values: {
			key: scenario.key,
			title: scenario.title,
			category: scenario.category,
			locale: scenario.locale,
			difficulty: scenario.difficulty,
			subject: content.subject,
			fromName: content.fromName ?? '',
			email: content.email,
			landing: content.landing,
			awareness: content.awareness,
			landingMode: scenario.landingMode,
			landingRedirectUrl: scenario.landingRedirectUrl ?? ''
		},
		tags: parseTags(scenario.tagsJson)
	};
};

export const actions: Actions = {
	default: async ({ request, locals, params }) => {
		if (!locals.user) return fail(401, { error: 'Non authentifié' });
		if (locals.user.role !== 'superadmin')
			return fail(403, { error: 'Modification réservée au superadmin' });

		const existing = getScenario(params.key);
		if (!existing) throw error(404, 'Scénario introuvable');
		ensureEditable(existing);

		const data = await request.formData();
		const str = (k: string) => String(data.get(k) ?? '').trim();
		const values = {
			// La clé ne change jamais : on affiche celle du scénario, sans tenir
			// compte d'une éventuelle valeur soumise.
			key: params.key,
			title: str('title'),
			category: str('category'),
			locale: str('locale'),
			difficulty: str('difficulty'),
			subject: str('subject'),
			fromName: str('fromName'),
			email: String(data.get('email') ?? ''),
			landing: String(data.get('landing') ?? ''),
			awareness: String(data.get('awareness') ?? ''),
			landingMode: str('landingMode') || 'awareness',
			landingRedirectUrl: str('landingRedirectUrl')
		};

		const bundle = {
			schemaVersion: BUNDLE_SCHEMA_VERSION,
			key: params.key,
			title: values.title,
			category: values.category,
			locale: values.locale,
			difficulty: values.difficulty,
			// Les tags existants sont préservés (le formulaire ne les édite pas).
			tags: parseTags(existing.tagsJson),
			subject: values.subject,
			fromName: values.fromName || null,
			email: values.email,
			landing: values.landing,
			awareness: values.awareness,
			landingMode: values.landingMode,
			landingRedirectUrl: values.landingRedirectUrl || null
		};

		let key: string;
		try {
			({ key } = await importBundle(bundle));
		} catch (e) {
			const message =
				e instanceof BundleImportError
					? e.message
					: e instanceof Error
						? e.message
						: 'Modification impossible.';
			return fail(400, { error: message, values });
		}
		audit(locals.user, 'scenario.update', { targetType: 'scenario', targetId: key });
		throw redirect(303, `/scenarios/${encodeURIComponent(key)}`);
	}
};
