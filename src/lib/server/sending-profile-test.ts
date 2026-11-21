import { buildTransport } from '$lib/server/mail/mailer';
import { getSendingProfile, getSmtpPassword } from '$lib/server/sending-profiles';
import type { SendingProfileView } from '$lib/server/sending-profiles';

export type ProfileTestResult = { ok: true } | { ok: false; error: string };

/** Profil visible par le tenant actif (le sien ou un profil global), sinon `null`. */
async function scopedProfile(
	profileId: string,
	tenantId: string | null
): Promise<SendingProfileView | null> {
	const profile = await getSendingProfile(profileId);
	if (!profile) return null;
	if (profile.tenantId !== null && profile.tenantId !== tenantId) return null;
	return profile;
}

/** Variantes sous lesquelles le mot de passe pourrait apparaître dans une erreur SMTP. */
function secretForms(username: string, password: string): string[] {
	if (!password) return [];
	const b64 = (v: string) => Buffer.from(v).toString('base64');
	return [
		password,
		b64(password),
		encodeURIComponent(password),
		b64(`\0${username}\0${password}`),
		b64(`${username}:${password}`)
	].filter((v) => v.length > 0);
}

/** Message d'erreur tronqué, dont tout secret (mot de passe et formes encodées) est masqué. */
export function safeMessage(e: unknown, secrets: string[] = []): string {
	let msg = e instanceof Error ? e.message : String(e);
	for (const secret of [...secrets].sort((x, y) => y.length - x.length))
		msg = msg.split(secret).join('[masqué]');
	return msg.slice(0, 300) || 'Erreur SMTP inconnue';
}

async function withTransport(
	profileId: string,
	tenantId: string | null,
	run: (profile: SendingProfileView, t: Awaited<ReturnType<typeof buildTransport>>) => Promise<void>
): Promise<ProfileTestResult> {
	const profile = await scopedProfile(profileId, tenantId);
	if (!profile) return { ok: false, error: 'Profil introuvable' };
	let secrets: string[] = [];
	try {
		secrets = secretForms(profile.username, await getSmtpPassword(profile.id));
	} catch {
		// Pas de mot de passe lisible : buildTransport échouera et sera rapporté.
	}
	try {
		const transport = await buildTransport(profile);
		try {
			await run(profile, transport);
		} finally {
			transport.close();
		}
		return { ok: true };
	} catch (e) {
		return { ok: false, error: safeMessage(e, secrets) };
	}
}

/** Teste la connexion et l'authentification SMTP (`transporter.verify()`). */
export function verifyProfile(profileId: string, tenantId: string | null) {
	return withTransport(profileId, tenantId, async (_p, t) => {
		await t.verify();
	});
}

/** Envoie un court e-mail texte de test à `to` via le profil. */
export function sendTestEmail(profileId: string, tenantId: string | null, to: string) {
	return withTransport(profileId, tenantId, async (p, t) => {
		await t.sendMail({
			from: { name: p.fromName, address: p.fromAddress },
			to,
			subject: 'Test de profil d’envoi Redfish',
			text: `Ceci est un e-mail de test envoyé avec le profil « ${p.name} ».`
		});
	});
}
