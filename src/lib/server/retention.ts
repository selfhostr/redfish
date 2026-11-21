import { and, eq, isNull, sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { campaignRecipients, campaigns, targets, tenants } from '$lib/server/db/schema';

const DAY_MS = 86_400_000;

/**
 * Rétention : anonymise les cibles (seul endroit où vit de la PII) dont TOUTES
 * les campagnes sont terminées et plus anciennes que `tenant.retentionDays`.
 * Les `events` ne portent aucune PII (invariant zero-capture) et
 * `campaignRecipients` n'est pas modifié : l'entonnoir des campagnes est donc
 * préservé par construction. L'e-mail devient un marqueur irréversible.
 */
export async function anonymizeExpired(now = new Date()): Promise<{ anonymized: number }> {
	let anonymized = 0;
	for (const tenant of db.select().from(tenants).all()) {
		const cutoff = new Date(now.getTime() - tenant.retentionDays * DAY_MS);
		const eligible = db
			.select({ id: targets.id })
			.from(targets)
			.where(
				and(
					eq(targets.tenantId, tenant.id),
					isNull(targets.anonymizedAt),
					// au moins une campagne, et aucune encore active ou récente
					sql`exists (select 1 from ${campaignRecipients} where ${campaignRecipients.targetId} = ${targets.id})`,
					sql`not exists (
						select 1 from ${campaignRecipients}
						join ${campaigns} on ${campaigns.id} = ${campaignRecipients.campaignId}
						where ${campaignRecipients.targetId} = ${targets.id}
						and (${campaigns.status} != 'completed' or ${campaigns.createdAt} > ${Math.floor(cutoff.getTime() / 1000)})
					)`
				)
			)
			.all();
		for (const { id } of eligible) {
			db.update(targets)
				.set({
					firstName: '',
					lastName: '',
					email: `redacted-${id}@redacted.invalid`,
					department: null,
					anonymizedAt: now
				})
				.where(eq(targets.id, id))
				.run();
			anonymized++;
		}
	}
	return { anonymized };
}
