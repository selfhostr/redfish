import { error, fail, redirect } from '@sveltejs/kit';
import {
	canSendCampaign,
	createAuthorization,
	listAuthorizations
} from '$lib/server/authorization';
import { audit } from '$lib/server/audit';
import { parseUtcDateTime } from '$lib/server/datetime';
import { deleteCampaign, getCampaign, scheduleCampaign } from '$lib/server/campaigns';
import { LaunchError, launchCampaign } from '$lib/server/campaigns/launch';
import { runPreflight } from '$lib/server/campaigns/preflight';
import { recordManualReports } from '$lib/server/tracking/events';
import { campaignFunnel } from '$lib/server/tracking/stats';
import { assertTenantAccess } from '$lib/server/tenant';
import { getScenarioById, toSummary } from '$lib/server/scenarios/listing';
import type { Actions, PageServerLoad } from './$types';

const campaignRef = (c: { id: string; tenantId: string }) => ({
	tenantId: c.tenantId,
	targetType: 'campaign',
	targetId: c.id
});

async function loadCampaign(user: NonNullable<App.Locals['user']>, id: string) {
	const campaign = await getCampaign(id);
	if (!campaign) throw error(404, 'Campagne introuvable');
	await assertTenantAccess(user, campaign.tenantId);
	return campaign;
}

export const load: PageServerLoad = async ({ locals, params }) => {
	if (!locals.user) throw redirect(303, '/login');
	const campaign = await loadCampaign(locals.user, params.id);
	// Après assertTenantAccess (dans loadCampaign) : le scénario est global, lu par id.
	const scenarioRow = getScenarioById(campaign.scenarioId);
	return {
		campaign,
		scenario: scenarioRow ? toSummary(scenarioRow) : null,
		authorizations: await listAuthorizations(campaign.id),
		canSend: await canSendCampaign(campaign.id),
		preflight: await runPreflight(campaign.id),
		funnel: await campaignFunnel(campaign.id)
	};
};

export const actions: Actions = {
	launch: async ({ locals, params }) => {
		if (!locals.user) throw redirect(303, '/login');
		const campaign = await loadCampaign(locals.user, params.id);
		if (campaign.status !== 'draft' && campaign.status !== 'scheduled')
			return fail(409, { error: `Campagne déjà lancée (statut : ${campaign.status})` });
		try {
			await launchCampaign(campaign.id);
		} catch (e) {
			if (e instanceof LaunchError) {
				const map = {
					unauthorized: [403, 'Lancement bloqué : aucune autorisation valide pour cette campagne.'],
					empty_list: [422, 'La liste de cibles est vide : ajoutez des cibles avant de lancer.'],
					bad_status: [409, 'Cette campagne a déjà été lancée.'],
					not_found: [404, 'Campagne introuvable.'],
					preflight_failed: [422, e.message]
				} as const;
				const [status, message] = map[e.code];
				return fail(status, { error: message });
			}
			throw e;
		}
		audit(locals.user, 'campaign.launch', campaignRef(campaign));
		return { success: true };
	},
	authorize: async ({ request, locals, params }) => {
		if (!locals.user) throw redirect(303, '/login');
		const campaign = await loadCampaign(locals.user, params.id);
		const data = await request.formData();
		const str = (k: string) => String(data.get(k) ?? '').trim();
		try {
			await createAuthorization({
				tenantId: campaign.tenantId,
				campaignId: campaign.id,
				reference: str('reference'),
				approvedBy: str('approvedBy'),
				validFrom: parseUtcDateTime(str('validFrom')) ?? new Date(NaN),
				validUntil: parseUtcDateTime(str('validUntil')) ?? new Date(NaN)
			});
		} catch (e) {
			return fail(400, { error: e instanceof Error ? e.message : 'Autorisation invalide' });
		}
		audit(locals.user, 'campaign.authorize', {
			...campaignRef(campaign),
			details: { reference: str('reference') }
		});
		return { success: true };
	},
	schedule: async ({ request, locals, params }) => {
		if (!locals.user) throw redirect(303, '/login');
		const campaign = await loadCampaign(locals.user, params.id);
		const scheduledAt = parseUtcDateTime(
			String((await request.formData()).get('scheduledAt') ?? '')
		);
		if (!scheduledAt) return fail(400, { error: 'Date invalide' });
		try {
			await scheduleCampaign(campaign.id, scheduledAt);
		} catch (e) {
			return fail(403, { error: e instanceof Error ? e.message : 'Envoi bloqué' });
		}
		audit(locals.user, 'campaign.schedule', {
			...campaignRef(campaign),
			details: { scheduledAt: scheduledAt.toISOString() }
		});
		return { success: true };
	},
	report: async ({ request, locals, params }) => {
		if (!locals.user) throw redirect(303, '/login');
		const campaign = await loadCampaign(locals.user, params.id);
		const raw = String((await request.formData()).get('emails') ?? '');
		const emails = raw
			.split(/[\r\n,;]+/)
			.map((e) => e.trim())
			.filter(Boolean);
		if (emails.length === 0) return fail(400, { error: 'Aucune adresse e-mail saisie.' });
		if (emails.length > 5000) return fail(400, { error: 'Trop d’adresses (5000 maximum).' });
		const { matched, unmatched } = recordManualReports(campaign.id, emails);
		audit(locals.user, 'campaign.report', {
			...campaignRef(campaign),
			details: { matched: matched.length, unmatched: unmatched.length }
		});
		return { reported: { matched: matched.length, unmatched } };
	},
	delete: async ({ request, locals, params }) => {
		if (!locals.user) throw redirect(303, '/login');
		const campaign = await loadCampaign(locals.user, params.id);
		const confirm = String((await request.formData()).get('confirm') ?? '').trim();
		// Vérification côté serveur : le nom saisi doit correspondre exactement.
		if (confirm !== campaign.name)
			return fail(400, { error: 'Le nom saisi ne correspond pas au nom de la campagne.' });
		await deleteCampaign(locals.user, campaign.id);
		audit(locals.user, 'campaign.delete', {
			...campaignRef(campaign),
			details: { name: campaign.name, status: campaign.status }
		});
		throw redirect(303, '/campaigns');
	}
};
