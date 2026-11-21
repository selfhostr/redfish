import { error, fail, redirect } from '@sveltejs/kit';
import { audit } from '$lib/server/audit';
import {
	BUNDLE_SCHEMA_VERSION,
	BundleImportError,
	importBundle
} from '$lib/server/scenarios/bundle';
import {
	SKELETON_AWARENESS,
	SKELETON_EMAIL,
	SKELETON_LANDING,
	SKELETON_SUBJECT
} from '$lib/scenarios/skeletons';
import type { Actions, PageServerLoad } from './$types';

/**
 * Éditeur de création d'un scénario (superadmin). Un scénario créé est GLOBAL,
 * comme un scénario importé : la création est donc réservée au superadmin (403
 * sinon), exactement comme l'import. Les gabarits sont pré-remplis avec des
 * squelettes NEUTRES et valides, puis assemblés en bundle et confiés à
 * `importBundle`, qui applique toutes les validations de sécurité (dont
 * l'invariant « zéro capture »).
 */

/** Valeurs initiales du formulaire : des squelettes neutres prêts à éditer. */
const defaults = {
	key: '',
	title: '',
	category: 'other',
	locale: 'fr',
	difficulty: 'easy',
	subject: SKELETON_SUBJECT,
	fromName: '',
	email: SKELETON_EMAIL,
	landing: SKELETON_LANDING,
	awareness: SKELETON_AWARENESS
};

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) throw redirect(303, '/login');
	if (locals.user.role !== 'superadmin') throw error(403, 'Création réservée au superadmin');
	return { defaults };
};

export const actions: Actions = {
	default: async ({ request, locals }) => {
		if (!locals.user) return fail(401, { error: 'Non authentifié' });
		if (locals.user.role !== 'superadmin')
			return fail(403, { error: 'Création réservée au superadmin' });

		const data = await request.formData();
		const str = (k: string) => String(data.get(k) ?? '').trim();
		const values = {
			key: str('key'),
			title: str('title'),
			category: str('category'),
			locale: str('locale'),
			difficulty: str('difficulty'),
			subject: str('subject'),
			fromName: str('fromName'),
			email: String(data.get('email') ?? ''),
			landing: String(data.get('landing') ?? ''),
			awareness: String(data.get('awareness') ?? '')
		};

		const bundle = {
			schemaVersion: BUNDLE_SCHEMA_VERSION,
			key: values.key,
			title: values.title,
			category: values.category,
			locale: values.locale,
			difficulty: values.difficulty,
			tags: [] as string[],
			subject: values.subject,
			fromName: values.fromName || null,
			email: values.email,
			landing: values.landing,
			awareness: values.awareness
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
						: 'Création impossible.';
			return fail(400, { error: message, values });
		}
		audit(locals.user, 'scenario.create', { targetType: 'scenario', targetId: key });
		throw redirect(303, `/scenarios/${encodeURIComponent(key)}`);
	}
};
