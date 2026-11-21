import { fail, redirect } from '@sveltejs/kit';
import { parseZonedDateTime } from '$lib/server/datetime';
import { utcToZonedInput } from '$lib/timezone';
import { db } from '$lib/server/db';
import { scenarios } from '$lib/server/db/schema';
import { activeTenantId } from '$lib/server/active-tenant';
import { audit } from '$lib/server/audit';
import { createAuthorization, latestValidAuthorization } from '$lib/server/authorization';
import { createCampaign, latestTrackingDomain } from '$lib/server/campaigns';
import { listSendingProfiles } from '$lib/server/sending-profiles';
import { countTargetsByList, listLists } from '$lib/server/targets';
import { assertTenantAccess, tenantTimezone } from '$lib/server/tenant';
import type { Actions, PageServerLoad } from './$types';

const emptyDefaults = { trackingDomain: '', authorization: null };

async function withTargetCounts(tenantId: string) {
	const counts = await countTargetsByList(tenantId);
	return (await listLists(tenantId)).map((l) => ({ ...l, targetCount: counts.get(l.id) ?? 0 }));
}

export const load: PageServerLoad = async ({ locals, cookies }) => {
	if (!locals.user) throw redirect(303, '/login');
	const tenantId = await activeTenantId(locals.user, cookies);
	if (!tenantId)
		return {
			tenantId: null,
			timezone: undefined,
			scenarios: [],
			profiles: [],
			lists: [],
			defaults: emptyDefaults
		};
	await assertTenantAccess(locals.user, tenantId);
	const lastAuth = await latestValidAuthorization(tenantId);
	const timezone = tenantTimezone(tenantId);
	return {
		tenantId,
		timezone,
		defaults: {
			trackingDomain: (await latestTrackingDomain(tenantId)) ?? '',
			authorization: lastAuth
				? {
						reference: lastAuth.reference,
						approvedBy: lastAuth.approvedBy,
						validFrom: utcToZonedInput(lastAuth.validFrom, timezone),
						validUntil: utcToZonedInput(lastAuth.validUntil, timezone)
					}
				: null
		},
		scenarios: db
			.select()
			.from(scenarios)
			.all()
			.filter((s) => s.enabled)
			.map((s) => ({
				id: s.id,
				key: s.key,
				title: s.title,
				category: s.category,
				difficulty: s.difficulty,
				locale: s.locale
			})),
		profiles: await listSendingProfiles(tenantId),
		lists: await withTargetCounts(tenantId)
	};
};

export const actions: Actions = {
	default: async ({ request, locals, cookies }) => {
		if (!locals.user) throw redirect(303, '/login');
		const tenantId = await activeTenantId(locals.user, cookies);
		if (!tenantId) return fail(400, { error: 'Aucun tenant actif' });
		await assertTenantAccess(locals.user, tenantId);
		const data = await request.formData();
		const str = (k: string) => String(data.get(k) ?? '').trim();
		const name = str('name');
		const scenarioId = str('scenarioId');
		const sendingProfileId = str('sendingProfileId');
		const targetListId = str('targetListId');
		const trackingDomain = str('trackingDomain');
		const reference = str('reference');
		const approvedBy = str('approvedBy');
		const tz = tenantTimezone(tenantId);
		const validFrom = parseZonedDateTime(str('validFrom'), tz);
		const validUntil = parseZonedDateTime(str('validUntil'), tz);
		if (!name || !scenarioId || !sendingProfileId || !targetListId || !trackingDomain)
			return fail(400, { error: 'Champs requis manquants' });
		if (!reference || !approvedBy || !validFrom || !validUntil)
			return fail(400, { error: 'Autorisation requise (référence, approbateur, période)' });

		let campaignId: string;
		try {
			const campaign = await createCampaign({
				tenantId,
				name,
				scenarioId,
				sendingProfileId,
				targetListId,
				trackingDomain,
				awarenessMessage: str('awarenessMessage') || null
			});
			campaignId = campaign.id;
			await createAuthorization({
				tenantId,
				campaignId,
				reference,
				validFrom,
				validUntil,
				approvedBy
			});
		} catch (e) {
			return fail(400, { error: e instanceof Error ? e.message : 'Création impossible' });
		}
		audit(locals.user, 'campaign.create', {
			tenantId,
			targetType: 'campaign',
			targetId: campaignId,
			details: { name, reference }
		});
		throw redirect(303, `/campaigns/${campaignId}`);
	}
};
