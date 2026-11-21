import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { campaignRecipients, events, targets } from '$lib/server/db/schema';
import { getCampaign } from '$lib/server/campaigns';
import { tenantTimezone } from '$lib/server/tenant';
import { campaignFunnel, type HumanFunnel } from '$lib/server/tracking/stats';

export type ReportDetail = { name: string; email: string; stage: string };
export type ReportData = {
	campaignId: string;
	campaignName: string;
	anonymized: boolean;
	/** Instant de génération, ISO 8601 UTC (affiché dans `timezone`). */
	generatedAt: string;
	/** Fuseau IANA du client, pour l'affichage. */
	timezone: string;
	/** Comptes humains (scanners automatiques exclus). */
	counts: HumanFunnel & { recipients: number; sent: number; failed: number };
	rates: { open: number; click: number; submission: number; awareness: number; report: number };
	attentionPoints: string[];
	recommendations: string[];
	/** Détail individuel : présent uniquement si non anonymisé. */
	details?: ReportDetail[];
};

const pct = (r: number) => `${Math.round(r * 100)} %`;
const STAGES: [string, string][] = [
	['reported', 'Signalé'],
	['awareness_viewed', 'Page de sensibilisation vue'],
	['form_submitted', 'Formulaire soumis'],
	['page_interaction', 'Interaction avec la page'],
	['clicked', 'Lien cliqué'],
	['opened', 'Message ouvert'],
	['sent', 'Envoyé']
];

export async function buildReport(
	campaignId: string,
	opts: { anonymize: boolean }
): Promise<ReportData> {
	const campaign = await getCampaign(campaignId);
	if (!campaign) throw new Error('Campagne introuvable');
	const f = await campaignFunnel(campaignId);
	// Les taux portent sur les envois réussis, pas sur les destinataires.
	const base = f.sent;
	const rate = (n: number) => (base > 0 ? n / base : 0);
	const h = f.human;
	const rates = {
		open: rate(h.opened),
		click: rate(h.clicked),
		submission: rate(h.formSubmitted),
		awareness: rate(h.awarenessViewed),
		report: rate(h.reported)
	};

	const attentionPoints: string[] = [];
	const recommendations: string[] = [];
	if (f.failed > 0)
		attentionPoints.push(
			`${f.failed} envoi(s) en échec : ces destinataires sont exclus des taux ci-dessous.`
		);
	if (base === 0) {
		attentionPoints.push('Aucun e-mail envoyé dans cette campagne.');
	} else {
		if (rates.click >= 0.3)
			attentionPoints.push(
				`Taux de clic élevé (${pct(rates.click)}) : une part importante des destinataires a suivi le lien.`
			);
		if (h.formSubmitted > 0)
			attentionPoints.push(
				`${h.formSubmitted} destinataire(s) ont soumis des informations sur la page simulée (${pct(rates.submission)}).`
			);
		if (h.clicked > 0 && h.reported === 0)
			attentionPoints.push("Aucun signalement : le message n'a été remonté à aucun moment.");
		if (h.formSubmitted > 0 && h.awarenessViewed < h.formSubmitted)
			attentionPoints.push(
				"Certains destinataires ayant soumis le formulaire n'ont pas consulté la page de sensibilisation."
			);
		if (f.opened > h.opened)
			attentionPoints.push(
				`${f.opened - h.opened} ouverture(s) automatisées (scanners) ont été exclues des statistiques.`
			);
		if (attentionPoints.length === 0)
			attentionPoints.push("Aucun point d'attention majeur relevé.");

		if (rates.click >= 0.3 || h.formSubmitted > 0)
			recommendations.push(
				"Organiser une session de sensibilisation ciblée sur la reconnaissance des liens et pages d'authentification frauduleux."
			);
		if (h.formSubmitted > 0)
			recommendations.push(
				"Rappeler de ne jamais saisir d'identifiants depuis un lien reçu par message et d'utiliser les favoris ou l'adresse officielle."
			);
		if (rates.report < 0.1)
			recommendations.push(
				'Promouvoir et faciliter le signalement des messages suspects (bouton de signalement, adresse dédiée).'
			);
		recommendations.push(
			'Renouveler régulièrement des campagnes de difficulté croissante pour mesurer la progression.'
		);
	}

	const report: ReportData = {
		campaignId,
		campaignName: campaign.name,
		anonymized: opts.anonymize,
		generatedAt: new Date().toISOString(),
		timezone: tenantTimezone(campaign.tenantId),
		counts: {
			recipients: f.recipients,
			sent: f.sent,
			failed: f.failed,
			opened: h.opened,
			clicked: h.clicked,
			pageInteraction: h.pageInteraction,
			formSubmitted: h.formSubmitted,
			awarenessViewed: h.awarenessViewed,
			reported: h.reported
		},
		rates,
		attentionPoints,
		recommendations
	};

	if (!opts.anonymize) {
		const rows = db
			.select({
				id: campaignRecipients.id,
				first: targets.firstName,
				last: targets.lastName,
				email: targets.email,
				status: campaignRecipients.sendStatus
			})
			.from(campaignRecipients)
			.innerJoin(targets, eq(campaignRecipients.targetId, targets.id))
			.where(eq(campaignRecipients.campaignId, campaignId))
			.all();
		const evs = db
			.select({ rid: events.campaignRecipientId, type: events.type })
			.from(events)
			.innerJoin(campaignRecipients, eq(events.campaignRecipientId, campaignRecipients.id))
			.where(eq(campaignRecipients.campaignId, campaignId))
			.all();
		const seen = new Map<string, Set<string>>();
		for (const e of evs) (seen.get(e.rid) ?? seen.set(e.rid, new Set()).get(e.rid)!).add(e.type);
		report.details = rows.map((r) => ({
			name: `${r.first ?? ''} ${r.last ?? ''}`.trim(),
			email: r.email,
			stage:
				r.status === 'failed'
					? 'Envoi en échec'
					: (STAGES.find(([k]) => seen.get(r.id)?.has(k))?.[1] ?? 'Aucune activité')
		}));
	}
	return report;
}
