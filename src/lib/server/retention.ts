import { and, eq, isNull, lte, sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { anonymizeTargetRow } from '$lib/server/person-data';
import { campaignRecipients, campaigns, targets, tenants } from '$lib/server/db/schema';

const DAY_MS = 86_400_000;

/**
 * Rétention : anonymise les cibles (seul endroit où vit de la PII) dont TOUTES
 * les campagnes sont terminées et plus anciennes que `tenant.retentionDays`.
 * Les `events` ne portent aucune PII (invariant zero-capture) et
 * `campaignRecipients` n'est pas modifié : l'entonnoir des campagnes est donc
 * préservé par construction. Les cibles jamais utilisées en campagne sont
 * supprimées une fois `retentionDays` écoulés depuis leur création. L'e-mail devient un marqueur irréversible.
 */
export async function anonymizeExpired(
	now = new Date()
): Promise<{ anonymized: number; deleted: number }> {
	let anonymized = 0;
	let deleted = 0;
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
			anonymizeTargetRow(db, id, now);
			anonymized++;
		}
		// Cibles jamais utilisées en campagne : supprimées après `retentionDays` depuis leur création.
		deleted += db
			.delete(targets)
			.where(
				and(
					eq(targets.tenantId, tenant.id),
					lte(targets.createdAt, cutoff),
					sql`not exists (select 1 from ${campaignRecipients} where ${campaignRecipients.targetId} = ${targets.id})`
				)
			)
			.run().changes;
	}
	return { anonymized, deleted };
}
