import { fail, redirect } from '@sveltejs/kit';
import { createSendingProfile, listSendingProfiles } from '$lib/server/sending-profiles';
import { sendTestEmail, verifyProfile } from '$lib/server/sending-profile-test';
import { rateLimit } from '$lib/server/ratelimit';
import { activeTenantId } from '$lib/server/active-tenant';
import { audit } from '$lib/server/audit';
import { assertTenantAccess } from '$lib/server/tenant';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, cookies }) => {
	if (!locals.user) throw redirect(303, '/login');
	const tenantId = await activeTenantId(locals.user, cookies);
	if (tenantId) await assertTenantAccess(locals.user, tenantId);
	return { profiles: await listSendingProfiles(tenantId), userEmail: locals.user.email };
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
		const str = (k: string) => String(data.get(k) ?? '').trim();
		const name = str('name');
		const host = str('host');
		const port = Number(str('port'));
		const username = str('username');
		const password = String(data.get('password') ?? '');
		const fromName = str('fromName');
		const fromAddress = str('fromAddress');
		const global = data.get('global') === 'on';

		if (!name || !host || !username || !password || !fromName || !fromAddress)
			return fail(400, { error: 'Tous les champs sont requis' });
		if (!Number.isInteger(port) || port < 1 || port > 65535)
			return fail(400, { error: 'Port invalide' });

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
	}
};
