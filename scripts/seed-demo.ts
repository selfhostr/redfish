/**
 * Jeu de données de démonstration (idempotent) : tenant « Fiduciaire Alpina SA »,
 * opérateur, liste de cibles, profil d'envoi, une campagne terminée avec un
 * entonnoir réaliste et une campagne brouillon autorisée (non lancée).
 *
 *   docker compose -f docker-compose.dev.yml run --rm app npm run db:seed:demo
 */
import { randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { createUser } from '../src/lib/server/auth';
import { db } from '../src/lib/server/db';
import {
	campaignRecipients,
	campaigns,
	events,
	tenants,
	userTenants,
	users
} from '../src/lib/server/db/schema';
import { createAuthorization } from '../src/lib/server/authorization';
import { createCampaign } from '../src/lib/server/campaigns';
import { importBundle } from '../src/lib/server/scenarios/bundle';
import { getScenario } from '../src/lib/server/scenarios/loader';
import {
	SKELETON_AWARENESS,
	SKELETON_EMAIL,
	SKELETON_LANDING
} from '../src/lib/scenarios/skeletons';
import { createSendingProfile } from '../src/lib/server/sending-profiles';
import { addTarget, createList } from '../src/lib/server/targets';
import { createTenant } from '../src/lib/server/tenant';

const TENANT_NAME = 'Fiduciaire Alpina SA';

if (db.select().from(tenants).where(eq(tenants.name, TENANT_NAME)).get()) {
	console.log(`Tenant « ${TENANT_NAME} » déjà présent, rien à faire.`);
	process.exit(0);
}

// Le dépôt ne livre aucun scénario : la démo en crée deux, NEUTRES, en base
// (comme le ferait l'éditeur de création), via importBundle (validation incluse).
async function ensureDemoScenario(key: string, title: string, subject: string) {
	const existing = getScenario(key);
	if (existing) return existing;
	await importBundle({
		schemaVersion: 1,
		key,
		title,
		category: 'other',
		locale: 'fr',
		difficulty: 'easy',
		tags: ['demo'],
		subject,
		fromName: 'Support IT',
		email: SKELETON_EMAIL,
		landing: SKELETON_LANDING,
		awareness: SKELETON_AWARENESS
	});
	return getScenario(key)!;
}

const operator =
	db.select().from(users).where(eq(users.email, 'op@alpina.ch')).get() ??
	(await createUser('op@alpina.ch', 'demo-operator-1234', 'operator'));
const tenant = await createTenant({
	name: TENANT_NAME,
	locale: 'fr',
	linkUserId: operator.id,
	contactName: 'Claire Morel',
	contactEmail: 'claire.morel@alpina.example',
	notes: 'Contact côté direction. Démo uniquement.'
});

const admin = db.select().from(users).where(eq(users.email, 'admin@redfish.local')).get();
if (admin) db.insert(userTenants).values({ userId: admin.id, tenantId: tenant.id }).run();

const list = await createList(tenant.id, 'Collaborateurs Alpina');
const people: [string, string, string, string][] = [
	['Jean-Marc', 'Favre', 'Direction', 'jean-marc.favre'],
	['Sophie', 'Fournier', 'Comptabilité', 'sophie.fournier'],
	['Nicolas', 'Zufferey', 'Comptabilité', 'nicolas.zufferey'],
	['Céline', 'Rey', 'RH', 'celine.rey'],
	['Pascal', 'Bonvin', 'IT', 'pascal.bonvin'],
	['Valérie', 'Dubuis', 'Ventes', 'valerie.dubuis'],
	['Julien', 'Mudry', 'Ventes', 'julien.mudry'],
	['Amélie', 'Gaillard', 'Comptabilité', 'amelie.gaillard'],
	['Christophe', 'Théodoloz', 'IT', 'christophe.theodoloz'],
	['Sandrine', 'Carron', 'RH', 'sandrine.carron'],
	['Michel', 'Crettaz', 'Direction', 'michel.crettaz'],
	['Laure', 'Perruchoud', 'Ventes', 'laure.perruchoud']
];
const targetRows = [];
for (const [firstName, lastName, department, local] of people) {
	targetRows.push(
		await addTarget(list.id, tenant.id, {
			email: `${local}@alpina-sa.ch`,
			firstName,
			lastName,
			department,
			locale: 'fr'
		})
	);
}

const profile = await createSendingProfile({
	tenantId: tenant.id,
	name: 'Alpina SMTP',
	host: 'smtp.alpina-sa.ch',
	port: 587,
	username: 'no-reply@alpina-sa.ch',
	password: 'changez-moi',
	fromName: 'Support IT',
	fromAddress: 'support@alpina-sa.ch'
});

const demoScenario = await ensureDemoScenario(
	'demo-sensibilisation',
	'Exemple de sensibilisation',
	'Message de test {{firstName}}'
);
const demoScenario2 = await ensureDemoScenario(
	'demo-rappel',
	'Exemple de rappel',
	'Rappel de test {{firstName}}'
);

// Campagne 1 : terminée, avec un entonnoir monotone.
const c1 = await createCampaign({
	tenantId: tenant.id,
	name: 'Sensibilisation Q4 : exemple',
	scenarioId: demoScenario.id,
	sendingProfileId: profile.id,
	targetListId: list.id,
	trackingDomain: 'http://192.168.0.11:9999'
});
const DAY = 86_400_000;
const sentAt = new Date(Date.now() - 14 * DAY);
// Rang d'avancement max par destinataire (index) : 12 envoyés, 8 ouverts,
// 4 clics, 3 interactions, 2 formulaires, 2 sensibilisations, 1 signalement.
const stages = [
	'sent',
	'opened',
	'clicked',
	'page_interaction',
	'form_submitted',
	'awareness_viewed'
] as const;
const depth = [5, 5, 3, 2, 1, 1, 1, 1, 0, 0, 0, 0]; // dernier index d'étape atteint
const reportedIdx = 6;
const automated = new Set(['7:opened', '3:clicked']);
const eventRows: (typeof events.$inferInsert)[] = [];
targetRows.forEach((t, i) => {
	const token = randomBytes(32).toString('base64url');
	const r = db
		.insert(campaignRecipients)
		.values({ campaignId: c1.id, targetId: t.id, token, sendStatus: 'sent', sentAt })
		.returning()
		.get();
	const reach = i === 7 ? 1 : depth[i]; // 7 : ouverture automatisée (scanner)
	for (let s = 0; s <= reach; s++) {
		eventRows.push({
			campaignRecipientId: r.id,
			type: stages[s],
			isAutomated: automated.has(`${i}:${stages[s]}`),
			uaCategory: automated.has(`${i}:${stages[s]}`) ? 'bot' : 'desktop',
			createdAt: new Date(sentAt.getTime() + (s + 1) * 3_600_000 + i * 60_000)
		});
	}
	if (i === reportedIdx)
		eventRows.push({
			campaignRecipientId: r.id,
			type: 'reported',
			uaCategory: 'desktop',
			createdAt: new Date(sentAt.getTime() + 5_400_000)
		});
});
db.insert(events).values(eventRows).run();
db.update(campaigns).set({ status: 'completed' }).where(eq(campaigns.id, c1.id)).run();

// Campagne 2 : brouillon autorisé, jamais lancé.
const c2 = await createCampaign({
	tenantId: tenant.id,
	name: 'Rappel : exemple',
	scenarioId: demoScenario2.id,
	sendingProfileId: profile.id,
	targetListId: list.id,
	trackingDomain: 'http://192.168.0.11:9999'
});
const now = new Date();
await createAuthorization({
	tenantId: tenant.id,
	campaignId: c2.id,
	reference: 'AUT-ALPINA-2026-02',
	validFrom: now,
	validUntil: new Date(now.getTime() + 30 * DAY),
	approvedBy: 'RK'
});

console.log(`Démo créée : tenant ${tenant.name}, opérateur op@alpina.ch, 2 campagnes.`);
process.exit(0);
