import { error, fail, redirect } from '@sveltejs/kit';
import { asc } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { sendingProfiles } from '$lib/server/db/schema';
import { audit } from '$lib/server/audit';
import { rateLimit } from '$lib/server/ratelimit';
import { createSendingProfile } from '$lib/server/sending-profiles';
import { checkProfileDomains } from '$lib/server/deliverability/checks';
import { runDeliverabilityChecks, tcpConnect } from '$lib/server/deliverability/run';
import { MAIL_MODULE_HOST, mailModuleConfig, readModuleDkim } from '$lib/server/mail/module';
import type { Actions, PageServerLoad } from './$types';

/** Diagnostic de délivrabilité, réservé aux superadmins (403 sinon). */
function requireSuperadmin(locals: App.Locals) {
	if (!locals.user) throw redirect(303, '/login');
	if (locals.user.role !== 'superadmin') throw error(403, 'Accès réservé aux superadmins');
	return locals.user;
}

const domainOf = (address: string) => address.split('@').pop()?.trim().toLowerCase() ?? '';

function profileRows() {
	return db
		.select({
			name: sendingProfiles.name,
			host: sendingProfiles.host,
			fromAddress: sendingProfiles.fromAddress
		})
		.from(sendingProfiles)
		.orderBy(asc(sendingProfiles.name))
		.all();
}

/** Seuls les domaines déjà configurés sont interrogés : adresses des profils + MAIL_DOMAIN. */
function knownDomains(profiles: { fromAddress: string }[], moduleDomain: string | null): string[] {
	const set = new Set(profiles.map((p) => domainOf(p.fromAddress)).filter(Boolean));
	if (moduleDomain) set.add(moduleDomain);
	const list = [...set].sort();
	return moduleDomain ? [moduleDomain, ...list.filter((d) => d !== moduleDomain)] : list;
}

function pick(url: URL, domains: string[]): string | null {
	const wanted = url.searchParams.get('domain');
	return wanted && domains.includes(wanted) ? wanted : (domains[0] ?? null);
}

export const load: PageServerLoad = async ({ locals, url }) => {
	requireSuperadmin(locals);
	const mod = mailModuleConfig();
	const profiles = profileRows();
	const domains = knownDomains(profiles, mod?.domain ?? null);
	const domain = pick(url, domains);
	const selector = url.searchParams.get('selector')?.trim() || null;

	const result = domain ? await runDeliverabilityChecks(domain, { selector }) : null;
	const checks = result ? [...result.checks] : [];
	if (mod && domain === mod.domain) checks.push(checkProfileDomains(profiles, mod.domain));

	// « En marche » : artefacts publiés ET mail:587 joignable.
	const running = mod
		? !!readModuleDkim() && (await tcpConnect(MAIL_MODULE_HOST, 587, 1500))
		: false;
	return {
		domains,
		domain,
		selector,
		checks,
		checkedAt: result?.checkedAt.toISOString() ?? null,
		isModuleDomain: !!mod && domain === mod.domain,
		module: {
			state: !mod ? ('none' as const) : running ? ('running' as const) : ('stopped' as const),
			domain: mod?.domain ?? null,
			hasPassword: !!mod?.smtpPassword,
			profileExists: profiles.some((p) => p.host === MAIL_MODULE_HOST),
			// Jamais la valeur du mot de passe : un emplacement à remplir.
			envBlock: [
				`MAIL_DOMAIN=${mod?.domain ?? 'exemple.ch'}`,
				`MAIL_HOSTNAME=${mod?.hostname ?? 'mail.exemple.ch'}`,
				`MAIL_DKIM_SELECTOR=${mod?.selector ?? 'redfish'}`,
				`MAIL_SMTP_USER=${mod?.smtpUser ?? 'redfish'}`,
				'MAIL_SMTP_PASSWORD=<mot de passe de 20 caractères minimum>'
			].join('\n')
		}
	};
};

export const actions: Actions = {
	recheck: async ({ request, locals }) => {
		const user = requireSuperadmin(locals);
		const data = await request.formData();
		const rl = rateLimit(`deliverability:${user.id}`, { limit: 5, windowMs: 60_000 });
		if (!rl.ok) return fail(429, { error: `Trop d'essais, réessayez dans ${rl.retryAfter} s` });
		const domains = knownDomains(profileRows(), mailModuleConfig()?.domain ?? null);
		const domain = String(data.get('domain') ?? '');
		if (!domains.includes(domain)) return fail(400, { error: 'Domaine inconnu' });
		const selector = String(data.get('selector') ?? '').trim() || null;
		await runDeliverabilityChecks(domain, { selector, force: true });
		return { rechecked: true };
	},
	createModuleProfile: async ({ locals }) => {
		const user = requireSuperadmin(locals);
		const mod = mailModuleConfig();
		if (!mod) return fail(400, { error: "Le module d'envoi n'est pas configuré (MAIL_DOMAIN)" });
		if (!mod.smtpPassword)
			return fail(400, { error: 'MAIL_SMTP_PASSWORD est absent de la configuration' });
		if (profileRows().some((p) => p.host === MAIL_MODULE_HOST))
			return { profileMessage: "Un profil d'envoi du module existe déjà" };
		const profile = await createSendingProfile({
			tenantId: null,
			name: "Serveur d'envoi intégré",
			host: MAIL_MODULE_HOST,
			port: 587,
			username: mod.smtpUser,
			password: mod.smtpPassword,
			fromName: mod.domain,
			fromAddress: `noreply@${mod.domain}`
		});
		audit(user, 'deliverability.create_module_profile', {
			targetType: 'sending_profile',
			targetId: profile.id,
			details: { domain: mod.domain }
		});
		return { profileMessage: "Profil d'envoi du module créé" };
	}
};
