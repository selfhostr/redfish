import { fail, redirect } from '@sveltejs/kit';
import {
	createSendingProfile,
	listSendingProfiles,
	parseProfileFields,
	updateSendingProfile
} from '$lib/server/sending-profiles';
import { sendTestEmail, verifyProfile } from '$lib/server/sending-profile-test';
import { rateLimit } from '$lib/server/ratelimit';
import { activeTenantId } from '$lib/server/active-tenant';
import { audit } from '$lib/server/audit';
import { assertTenantAccess } from '$lib/server/tenant';
import { MAIL_MODULE_HOST, mailModuleConfig } from '$lib/server/mail/module';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, cookies }) => {
	if (!locals.user) throw redirect(303, '/login');
	const tenantId = await activeTenantId(locals.user, cookies);
	if (tenantId) await assertTenantAccess(locals.user, tenantId);
	const profiles = await listSendingProfiles(tenantId);
	// Un profil qui passe par le module doit envoyer depuis le domaine signé (DKIM/DMARC).
	const moduleDomain = mailModuleConfig()?.domain ?? null;
	const wrongDomainIds = profiles
		.filter(
			(p) =>
				p.host === MAIL_MODULE_HOST &&
				moduleDomain &&
				p.fromAddress.split('@').pop()?.toLowerCase() !== moduleDomain
		)
		.map((p) => p.id);
	return { profiles, userEmail: locals.user.email, wrongDomainIds };
};

export const actions: Actions = {
	verify: async ({ request, locals, cookies }) => {
		if (!locals.user) throw redirect(303, '/login');
		const profileId = String((await request.formData()).get('profileId') ?? '');
		const tenantId = await activeTenantId(locals.user, cookies);
		if (tenantId) await assertTenantAccess(locals.user, tenantId);
		const rl = rateLimit(`profile-verify:${locals.user.id}`, { limit: 10, windowMs: 60_000 });
		if (!rl.ok)
			return fail(429, {
				testError: `Trop d'essais, réessayez dans ${rl.retryAfter} s`,
				profileId
			});
		const r = await verifyProfile(profileId, tenantId);
		if (!r.ok) return fail(400, { testError: r.error, profileId });
		return { testOk: 'Connexion SMTP réussie', profileId };
	},
	sendTest: async ({ request, locals, cookies }) => {
		if (!locals.user) throw redirect(303, '/login');
		const data = await request.formData();
		const profileId = String(data.get('profileId') ?? '');
		const to = String(data.get('to') ?? '').trim();
		if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to))
			return fail(400, { testError: 'Adresse de test invalide', profileId });
		// Anti-relais ouvert : le destinataire est toujours l'adresse de l'utilisateur connecté.
		if (to.toLowerCase() !== locals.user.email.toLowerCase())
			return fail(400, {
				testError: 'L’e-mail de test ne peut être envoyé qu’à votre propre adresse.',
				profileId
			});
		const tenantId = await activeTenantId(locals.user, cookies);
		if (tenantId) await assertTenantAccess(locals.user, tenantId);
		const rl = rateLimit(`profile-test:${locals.user.id}`, { limit: 5, windowMs: 60_000 });
		if (!rl.ok)
			return fail(429, {
				testError: `Trop d'essais, réessayez dans ${rl.retryAfter} s`,
				profileId
			});
		const r = await sendTestEmail(profileId, tenantId, to);
		if (!r.ok) return fail(400, { testError: r.error, profileId });
		return { testOk: `E-mail de test envoyé à ${to}`, profileId };
	},
	create: async ({ request, locals, cookies }) => {
		if (!locals.user) throw redirect(303, '/login');
		const user = locals.user;
		const data = await request.formData();
		const parsed = parseProfileFields(data);
		if (!parsed.ok) return fail(400, { error: parsed.error });
		const { name, host, port, username, password, fromName, fromAddress } = parsed.fields;
		const global = data.get('global') === 'on';

		let tenantId: string | null = null;
		if (global) {
			if (user.role !== 'superadmin')
				return fail(403, { error: 'Profil global réservé au superadmin' });
		} else {
			tenantId = await activeTenantId(user, cookies);
			if (!tenantId) return fail(400, { error: 'Aucun tenant actif' });
			await assertTenantAccess(user, tenantId);
		}

		const profile = await createSendingProfile({
			tenantId,
			name,
			host,
			port,
			username,
			password,
			fromName,
			fromAddress
		});
		audit(user, 'sending_profile.create', {
			tenantId,
			targetType: 'sending_profile',
			targetId: profile.id,
			details: { name, host, global }
		});
		return { success: true };
	},
	update: async ({ request, locals }) => {
		if (!locals.user) throw redirect(303, '/login');
		const data = await request.formData();
		const profileId = String(data.get('profileId') ?? '');
		const parsed = parseProfileFields(data, { passwordOptional: true });
		if (!parsed.ok) return fail(400, { editError: parsed.error, editId: profileId });
		const r = await updateSendingProfile(locals.user, profileId, parsed.fields);
		if (!r.ok) return fail(r.status, { editError: r.error, editId: profileId });
		return { editOk: 'Profil modifié', editId: profileId };
	}
};
