import { count, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { campaigns, scenarios } from '$lib/server/db/schema';

export type DeleteOutcome = 'deleted' | 'archived' | 'not_found';

/** Nombre de campagnes (tous clients confondus) qui utilisent ce scénario. */
export function countCampaignsUsing(scenarioId: string): number {
	return db
		.select({ n: count() })
		.from(campaigns)
		.where(eq(campaigns.scenarioId, scenarioId))
		.get()!.n;
}

/**
 * Supprime un scénario jamais utilisé ; l'archive s'il l'est (l'historique et
 * les rapports des campagnes restent lisibles). Les scénarios sont globaux :
 * l'autorisation (superadmin) est vérifiée par l'appelant.
 */
export function deleteOrArchiveScenario(key: string): DeleteOutcome {
	return db.transaction((tx) => {
		const s = tx.select().from(scenarios).where(eq(scenarios.key, key)).get();
		if (!s) return 'not_found';
		const used = tx
			.select({ n: count() })
			.from(campaigns)
			.where(eq(campaigns.scenarioId, s.id))
			.get()!.n;
		if (used === 0) {
			tx.delete(scenarios).where(eq(scenarios.id, s.id)).run();
			return 'deleted';
		}
		tx.update(scenarios).set({ archivedAt: new Date() }).where(eq(scenarios.id, s.id)).run();
		return 'archived';
	});
}

/** Restaure un scénario archivé. Renvoie false s'il n'existe pas. */
export function restoreScenario(key: string): boolean {
	return (
		db.update(scenarios).set({ archivedAt: null }).where(eq(scenarios.key, key)).run().changes > 0
	);
}
