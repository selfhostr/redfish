import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import {
	authorizations,
	campaigns,
	scenarios,
	sendingProfiles,
	targets
} from '$lib/server/db/schema';
import type { Authorization, Campaign, Scenario, Target } from '$lib/server/db/schema';
import { hostConfigFromEnv } from '$lib/server/hosts';
import type { HostConfig } from '$lib/server/hosts';
import { renderAwareness, renderEmail, renderLanding } from '$lib/server/scenarios/render';
import type { RenderCtx } from '$lib/server/scenarios/render';
import type { SendingProfileView } from '$lib/server/sending-profiles';
import { isValidEmail } from '$lib/server/targets';

export type PreflightSeverity = 'error' | 'warning' | 'info';
export type PreflightSection = 'targets' | 'profile' | 'scenario' | 'schedule' | 'tracking';

export type PreflightItem = {
	section: PreflightSection;
	severity: PreflightSeverity;
	message: string;
};

export type PreflightReport = {
	items: PreflightItem[];
	/** Nombre de cibles qui recevront réellement un e-mail. */
	sendable: number;
	/** Cibles exclues (anonymisées ou adresse invalide). */
	excluded: { anonymized: number; invalid: number };
	total: number;
	errors: number;
	warnings: number;
	/** Faux dès qu'une erreur bloquante est présente. */
	ok: boolean;
};

export type PreflightInput = {
	campaign: Pick<Campaign, 'status' | 'trackingDomain' | 'scheduledAt'>;
	targets: Pick<Target, 'email' | 'anonymizedAt'>[];
	profile: SendingProfileView | null;
	scenario: Scenario | null;
	authorizations: Pick<Authorization, 'validFrom' | 'validUntil'>[];
	now: Date;
	/** Valeur de ORIGIN (SvelteKit adapter-node), si définie. */
	origin?: string;
	hosts?: HostConfig;
	/** Rendu injectable (tests) ; par défaut le vrai pipeline MJML/gabarits. */
	renderers?: ScenarioRenderers;
};

export type ScenarioRenderers = {
	email: (s: Scenario, ctx: RenderCtx) => Promise<unknown>;
	landing: (s: Scenario, ctx: RenderCtx) => Promise<string>;
	awareness: (s: Scenario, ctx: RenderCtx) => Promise<string>;
};

const defaultRenderers: ScenarioRenderers = {
	email: renderEmail,
	landing: renderLanding,
	awareness: renderAwareness
};

const sampleCtx: RenderCtx = {
	firstName: 'Camille',
	lastName: 'Exemple',
	email: 'camille@example.test',
	urls: {
		open: 'https://track.example.test/t/o/x',
		click: 'https://track.example.test/t/c/x',
		submit: 'https://track.example.test/t/s/x',
		beacon: 'https://track.example.test/t/b/x',
		awareness: 'https://track.example.test/t/a/x',
		report: 'https://track.example.test/t/r/x'
	}
};

const hostOf = (v: string): string | null => {
	try {
		return new URL(/^https?:\/\//i.test(v) ? v : `https://${v}`).host.toLowerCase();
	} catch {
		return null;
	}
};

/**
 * Contrôle de pré-lancement : fonction sans accès base ni horloge cachée. Les
 * erreurs bloquent le lancement, les avertissements non. Appelée à l'affichage
 * (page campagne) ET au lancement (`launchCampaign`), donc non contournable.
 */
export async function evaluatePreflight(input: PreflightInput): Promise<PreflightReport> {
	const items: PreflightItem[] = [];
	const add = (section: PreflightSection, severity: PreflightSeverity, message: string) =>
		items.push({ section, severity, message });
	const { campaign, now } = input;

	// Cibles
	const anonymized = input.targets.filter((t) => t.anonymizedAt).length;
	const invalid = input.targets.filter((t) => !t.anonymizedAt && !isValidEmail(t.email)).length;
	const sendable = input.targets.length - anonymized - invalid;
	if (input.targets.length === 0) add('targets', 'error', 'La liste de cibles est vide.');
	else if (sendable === 0) add('targets', 'error', 'Aucune cible ne peut recevoir d’e-mail.');
	else add('targets', 'info', `${sendable} cible(s) recevront l’e-mail.`);
	if (anonymized > 0)
		add('targets', 'warning', `${anonymized} cible(s) anonymisée(s) seront exclues.`);
	if (invalid > 0) add('targets', 'warning', `${invalid} adresse(s) invalide(s) seront exclues.`);

	// Profil d'envoi
	const p = input.profile;
	if (!p) add('profile', 'error', 'Profil d’envoi introuvable.');
	else {
		const missing = [
			!p.host.trim() && 'serveur',
			!(p.port > 0 && p.port < 65536) && 'port',
			!p.username.trim() && 'identifiant',
			!p.fromName.trim() && 'nom d’expéditeur'
		].filter(Boolean);
		if (missing.length > 0)
			add('profile', 'error', `Profil d’envoi incomplet (${missing.join(', ')}).`);
		if (!isValidEmail(p.fromAddress))
			add('profile', 'error', 'L’adresse d’expéditeur du profil est invalide.');
		if (missing.length === 0 && isValidEmail(p.fromAddress))
			add('profile', 'info', `Profil « ${p.name} » complet (${p.fromAddress}).`);
	}

	// Scénario
	const s = input.scenario;
	if (!s) add('scenario', 'error', 'Scénario introuvable.');
	else if (!s.enabled) add('scenario', 'error', `Le scénario « ${s.title} » est désactivé.`);
	else {
		const r = input.renderers ?? defaultRenderers;
		const attempts: [string, () => Promise<unknown>][] = [
			['e-mail', () => r.email(s, sampleCtx)],
			['page de destination', () => r.landing(s, sampleCtx)],
			['page de sensibilisation', () => r.awareness(s, sampleCtx)]
		];
		let rendered = 0;
		for (const [label, run] of attempts) {
			try {
				const out = await run();
				const html = typeof out === 'string' ? out : ((out as { html?: string })?.html ?? '');
				if (!html.trim()) add('scenario', 'error', `Gabarit « ${label} » vide.`);
				else rendered++;
			} catch (e) {
				add(
					'scenario',
					'error',
					`Gabarit « ${label} » illisible ou invalide : ${e instanceof Error ? e.message : 'erreur'}`
				);
			}
		}
		if (rendered === attempts.length)
			add('scenario', 'info', `Scénario « ${s.title} » activé, gabarits rendus sans erreur.`);
	}

	// Autorisation et calendrier
	const covers = (at: Date) =>
		input.authorizations.some(
			(a) => a.validFrom.getTime() <= at.getTime() && at.getTime() <= a.validUntil.getTime()
		);
	if (input.authorizations.length === 0)
		add('schedule', 'error', 'Aucune autorisation liée à la campagne.');
	else if (!covers(now)) add('schedule', 'error', 'Autorisation expirée ou pas encore valide.');
	if (campaign.status === 'scheduled' && campaign.scheduledAt) {
		if (campaign.scheduledAt.getTime() < now.getTime())
			add('schedule', 'warning', 'L’heure programmée est passée : l’envoi partira immédiatement.');
		else if (!covers(campaign.scheduledAt))
			add('schedule', 'error', 'L’autorisation ne couvre pas l’heure programmée.');
		else add('schedule', 'info', `Envoi programmé le ${campaign.scheduledAt.toISOString()}.`);
	} else add('schedule', 'info', 'Envoi immédiat.');

	// Tracking / ORIGIN
	const track = campaign.trackingDomain.trim();
	const trackHost = track ? hostOf(track) : null;
	if (!trackHost) add('tracking', 'error', 'Domaine de tracking absent ou invalide.');
	else {
		if (/^http:\/\//i.test(track))
			add('tracking', 'warning', 'Le domaine de tracking utilise http : liens non chiffrés.');
		const hosts = input.hosts ?? {};
		if (hosts.tracking && trackHost !== hosts.tracking)
			add(
				'tracking',
				'warning',
				`Le domaine de tracking (${trackHost}) diffère de TRACKING_HOST (${hosts.tracking}) : les liens ne seront pas servis.`
			);
		if (hosts.dashboard && trackHost === hosts.dashboard)
			add(
				'tracking',
				'warning',
				'Le tracking partage l’hôte du tableau de bord (origine commune).'
			);
	}
	if (!input.origin?.trim())
		add(
			'tracking',
			'warning',
			'ORIGIN n’est pas défini : les envois de formulaires peuvent être refusés derrière un proxy.'
		);

	const errors = items.filter((i) => i.severity === 'error').length;
	return {
		items,
		sendable,
		excluded: { anonymized, invalid },
		total: input.targets.length,
		errors,
		warnings: items.filter((i) => i.severity === 'warning').length,
		ok: errors === 0
	};
}

/** Rassemble les données d'une campagne en base puis évalue le pré-lancement. */
export async function runPreflight(
	campaignId: string,
	now: Date = new Date(),
	env: NodeJS.ProcessEnv = process.env
): Promise<PreflightReport | null> {
	const campaign = db.select().from(campaigns).where(eq(campaigns.id, campaignId)).get();
	if (!campaign) return null;
	const profile =
		db
			.select()
			.from(sendingProfiles)
			.where(eq(sendingProfiles.id, campaign.sendingProfileId))
			.get() ?? null;
	const { passwordEnc: _omit, ...view } = profile ?? ({} as never);
	void _omit;
	return evaluatePreflight({
		campaign,
		targets: db.select().from(targets).where(eq(targets.listId, campaign.targetListId)).all(),
		profile: profile ? (view as SendingProfileView) : null,
		scenario:
			db.select().from(scenarios).where(eq(scenarios.id, campaign.scenarioId)).get() ?? null,
		authorizations: db
			.select()
			.from(authorizations)
			.where(eq(authorizations.campaignId, campaignId))
			.all(),
		now,
		origin: env.ORIGIN,
		hosts: hostConfigFromEnv(env)
	});
}
