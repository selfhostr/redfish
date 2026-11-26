import { error, json } from '@sveltejs/kit';
import { rateLimit } from '$lib/server/ratelimit';
import {
	BundleImportError,
	validateAttachment,
	validateAwareness,
	validateEmailQr,
	validateLanding
} from '$lib/server/scenarios/bundle';
import { renderDraftPreview, type DraftIssue } from '$lib/server/scenarios/preview';
import type { RequestHandler } from './$types';

/**
 * Aperçu en direct de l'éditeur de création (POST, formulaire). Rend un contenu
 * NON ENREGISTRÉ : rien n'est écrit en base, aucun jeton ni événement n'est créé.
 *
 * - Autorisation : identique à la page `/scenarios/new` (superadmin seulement).
 * - CSRF : seuls les corps de formulaire sont acceptés (415 sinon), de sorte que
 *   la vérification d'origine de SvelteKit (`csrf.checkOrigin`), commune à toute
 *   l'application, s'applique à chaque appel.
 * - Débit : chaque appel compile du MJML ; le client temporise (anti-rebond),
 *   et le serveur borne en plus le débit par utilisateur (429 au-delà).
 * - Sortie : passe par `renderDraftPreview`, donc par le même assainissement et
 *   la même CSP que l'aperçu d'un scénario enregistré.
 */

/** Taille maximale d'un gabarit (caractères) : borne le coût de compilation MJML. */
const MAX_TEMPLATE_LENGTH = 200_000;

/** Débit maximal par utilisateur : large pour la frappe (anti-rebond 500 ms côté client). */
export const _PREVIEW_RATE_LIMIT = { limit: 120, windowMs: 60_000 };

const FORM_TYPES = ['multipart/form-data', 'application/x-www-form-urlencoded'];

/** Problème de validation « import » (zéro capture, note de sensibilisation). */
function validationIssue(
	field: DraftIssue['field'],
	check: (src: string) => void,
	src: string
): DraftIssue | null {
	try {
		check(src);
		return null;
	} catch (e) {
		return { field, message: e instanceof Error ? e.message : String(e) };
	}
}

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) throw error(401, 'Non authentifié');
	if (locals.user.role !== 'superadmin') throw error(403, 'Création réservée au superadmin');

	const rl = rateLimit(`preview:user:${locals.user.id}`, _PREVIEW_RATE_LIMIT);
	if (!rl.ok) {
		return json(
			{ message: 'Trop de demandes d’aperçu : patientez quelques secondes.' },
			{
				status: 429,
				headers: { 'retry-after': String(rl.retryAfter ?? 1), 'cache-control': 'no-store' }
			}
		);
	}

	const type = (request.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
	if (!FORM_TYPES.includes(type)) throw error(415, 'Formulaire attendu');

	const data = await request.formData();
	const str = (k: string) => {
		const v = data.get(k);
		return typeof v === 'string' ? v : '';
	};
	const attachmentMode = str('attachmentMode').trim() || 'none';
	const includeQr = ['true', 'on', '1'].includes(str('includeQr').trim());
	const content = {
		subject: str('subject').trim(),
		fromName: str('fromName').trim() || undefined,
		email: str('email'),
		landing: str('landing'),
		awareness: str('awareness'),
		attachmentMode: (attachmentMode === 'html' || attachmentMode === 'pdf'
			? attachmentMode
			: 'none') as 'none' | 'html' | 'pdf',
		attachmentFilename: str('attachmentFilename').trim() || null,
		attachmentTemplate: str('attachmentTemplate') || null,
		includeQr
	};
	if (
		[content.subject, content.email, content.landing, content.awareness].some(
			(v) => v.length > MAX_TEMPLATE_LENGTH
		)
	) {
		throw error(413, 'Gabarit trop volumineux pour l’aperçu');
	}

	const { preview, issues } = await renderDraftPreview(
		{ key: str('key').trim(), title: str('title').trim() },
		content
	);
	for (const issue of [
		validationIssue('landing', validateLanding, content.landing),
		validationIssue('awareness', validateAwareness, content.awareness)
	]) {
		if (issue) issues.push(issue);
	}

	// Cohérence du QR code : include_qr actif → {{qrCode}} requis dans l'e-mail.
	if (content.includeQr) {
		try {
			validateEmailQr(content.email, true);
		} catch (e) {
			issues.push({
				field: 'email',
				message:
					e instanceof BundleImportError ? e.message : e instanceof Error ? e.message : String(e)
			});
		}
	}

	// Validation « zéro capture » de la pièce jointe piégée (signature propre).
	if (content.attachmentMode !== 'none') {
		try {
			validateAttachment(
				content.attachmentMode,
				content.attachmentFilename,
				content.attachmentTemplate
			);
		} catch (e) {
			issues.push({
				field: 'attachment',
				message:
					e instanceof BundleImportError ? e.message : e instanceof Error ? e.message : String(e)
			});
		}
	}

	return json({ preview, issues }, { headers: { 'cache-control': 'no-store' } });
};
