/**
 * Fictional data set for the documentation and website screenshots
 * (`npm run screenshots`). Every name, address and domain is invented:
 * organisations carry « Démo » in their name and every address uses the
 * reserved `.example` TLD. Run it on a throwaway database only.
 *
 *   Superadmin: admin@demo.example / screenshots-demo-1234
 *   Operator:   operateur@demo.example / screenshots-demo-1234
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
	userTenants
} from '../src/lib/server/db/schema';
import { createAuthorization } from '../src/lib/server/authorization';
import { createCampaign } from '../src/lib/server/campaigns';
import { importBundle } from '../src/lib/server/scenarios/bundle';
import { getScenario } from '../src/lib/server/scenarios/loader';
import { SKELETON_LANDING } from '../src/lib/scenarios/skeletons';
import { createSendingProfile } from '../src/lib/server/sending-profiles';
import { addTarget, createList } from '../src/lib/server/targets';
import { createTenant } from '../src/lib/server/tenant';

export const SHOTS_PASSWORD = 'screenshots-demo-1234';
const MAIN = 'Fiduciaire Démo Lémanique SA';

if (db.select().from(tenants).where(eq(tenants.name, MAIN)).get()) {
	console.log(`« ${MAIN} » already exists, nothing to do.`);
	process.exit(0);
}

/** Neutral, fictional e-mail template: an internal notice with no real brand. */
export const SHOTS_EMAIL = `<mjml>
	<mj-head>
		<mj-attributes>
			<mj-all font-family="Helvetica, Arial, sans-serif" />
			<mj-text font-size="15px" line-height="1.6" color="#1f2933" />
		</mj-attributes>
	</mj-head>
	<mj-body background-color="#f3f4f6">
		<mj-section background-color="#1f3a5f" padding="18px 24px">
			<mj-column>
				<mj-text color="#ffffff" font-size="17px" font-weight="600">Service RH · Intranet</mj-text>
			</mj-column>
		</mj-section>
		<mj-section background-color="#ffffff" padding="28px 24px">
			<mj-column>
				<mj-text>Bonjour {{firstName}},</mj-text>
				<mj-text>La politique de télétravail a été mise à jour pour 2027. Merci d'en prendre connaissance et de confirmer votre lecture avant vendredi.</mj-text>
				<mj-button href="{{clickUrl}}" background-color="#1f3a5f" border-radius="6px" font-size="15px">Lire la politique</mj-button>
				<mj-text font-size="13px" color="#6b7280">Service des ressources humaines</mj-text>
			</mj-column>
		</mj-section>
		<mj-raw><img src="{{openUrl}}" width="1" height="1" alt="" style="display:none" /></mj-raw>
	</mj-body>
</mjml>
`;

/** Awareness page a target sees after the click: what happened and what to check next time. */
const SHOTS_AWARENESS = `<!doctype html>
<html lang="fr">
	<head>
		<meta charset="utf-8" />
		<meta name="viewport" content="width=device-width, initial-scale=1" />
		<title>Exercice de sensibilisation</title>
		<style>
			body { margin: 0; background: #f3f4f6; color: #1f2933; font: 16px/1.6 Helvetica, Arial, sans-serif; }
			main { max-width: 640px; margin: 64px auto; padding: 40px 44px; background: #fff; border-radius: 14px; box-shadow: 0 10px 30px -12px rgb(0 0 0 / .2); }
			.tag { display: inline-block; padding: 4px 10px; border-radius: 999px; background: #e7f0fb; color: #1f3a5f; font-size: 13px; font-weight: 600; }
			h1, h2 { color: #1f2933; }
			ul { list-style: disc; padding-left: 1.3em; }
			h1 { font-size: 28px; line-height: 1.25; margin: 18px 0 12px; }
			.note { padding: 14px 16px; border-left: 4px solid #1f3a5f; background: #f6f8fb; border-radius: 6px; }
			h2 { font-size: 17px; margin: 28px 0 8px; }
			li { margin: 6px 0; }
			p { margin: 0 0 12px; }
			footer { margin-top: 28px; color: #6b7280; font-size: 14px; }
		</style>
	</head>
	<body>
		<main>
			<span class="tag">Exercice de sensibilisation</span>
			<h1>Bonjour {{firstName}}, ce message était un exercice.</h1>
			<div class="note">{{awarenessMessage}}</div>
			<h2>Les indices à repérer</h2>
			<ul>
				<li>Une demande urgente, avec une échéance courte.</li>
				<li>Une adresse d'expéditeur qui ne correspond pas au domaine habituel.</li>
				<li>Un lien dont l'adresse réelle diffère du texte affiché.</li>
			</ul>
			<h2>La prochaine fois</h2>
			<p>Signalez le message avec le bouton « Signaler » de votre messagerie. Aucune donnée saisie n'a été enregistrée.</p>
			<footer>Votre équipe sécurité</footer>
		</main>
	</body>
</html>
`;

await importBundle({
	schemaVersion: 1,
	key: 'politique-teletravail',
	title: 'Politique de télétravail mise à jour',
	category: 'other',
	locale: 'fr',
	difficulty: 'medium',
	tags: ['demo', 'rh'],
	subject: 'Politique de télétravail 2027 : merci de confirmer, {{firstName}}',
	fromName: 'Service RH',
	email: SHOTS_EMAIL,
	landing: SKELETON_LANDING,
	awareness: SHOTS_AWARENESS
});
const scenario = getScenario('politique-teletravail')!;

const admin = await createUser('admin@demo.example', SHOTS_PASSWORD, 'superadmin');
const operator = await createUser('operateur@demo.example', SHOTS_PASSWORD, 'operator');

const FIRST = [
	'Claire',
	'Marc',
	'Sophie',
	'Nicolas',
	'Céline',
	'Pascal',
	'Valérie',
	'Julien',
	'Amélie',
	'Thomas',
	'Sandrine',
	'Michel',
	'Laure',
	'David',
	'Nadia',
	'Olivier'
];
const LAST = ['Morel', 'Favre', 'Rochat', 'Perret', 'Gerber', 'Jaquet', 'Bovet', 'Monnier'];
const DEPTS = ['Direction', 'Comptabilité', 'RH', 'IT', 'Ventes', 'Révision'];
const DAY = 86_400_000;
const STAGES = [
	'sent',
	'opened',
	'clicked',
	'page_interaction',
	'form_submitted',
	'awareness_viewed'
] as const;

function ascii(s: string) {
	return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

async function client(opts: {
	name: string;
	domain: string;
	contact: [string, string];
	size: number;
	notes?: string;
}) {
	const tenant = await createTenant({
		name: opts.name,
		locale: 'fr',
		linkUserId: operator.id,
		contactName: opts.contact[0],
		contactEmail: `${opts.contact[1]}@${opts.domain}`,
		notes: opts.notes ?? 'Données fictives de démonstration.'
	});
	db.insert(userTenants).values({ userId: admin.id, tenantId: tenant.id }).run();
	const list = await createList(tenant.id, 'Tous les collaborateurs');
	const targets = [];
	for (let i = 0; i < opts.size; i++) {
		const firstName = FIRST[i % FIRST.length];
		const lastName = LAST[(i * 5 + Math.floor(i / FIRST.length)) % LAST.length];
		targets.push(
			await addTarget(list.id, tenant.id, {
				email: `${ascii(firstName)}.${ascii(lastName)}${i >= FIRST.length ? i : ''}@${opts.domain}`,
				firstName,
				lastName,
				department: DEPTS[i % DEPTS.length],
				locale: 'fr'
			})
		);
	}
	const profile = await createSendingProfile({
		tenantId: tenant.id,
		name: 'Relais SMTP démo',
		host: 'smtp.demo.example',
		port: 587,
		username: 'exercices@demo.example',
		password: 'not-a-real-password',
		fromName: 'Service RH',
		fromAddress: 'rh@intranet-demo.example'
	});
	return { tenant, list, targets, profile };
}

/**
 * A completed campaign. `counts` gives how many people reached each stage
 * (sent, opened, clicked, interaction, form, awareness), `reported` how many
 * reported the message, `bots` how many automated clicks a mail scanner made.
 */
async function completed(
	c: Awaited<ReturnType<typeof client>>,
	name: string,
	daysAgo: number,
	counts: number[],
	reported: number,
	bots: number
) {
	const camp = await createCampaign({
		tenantId: c.tenant.id,
		name,
		scenarioId: scenario.id,
		sendingProfileId: c.profile.id,
		targetListId: c.list.id,
		trackingDomain: 'https://exercices.demo.example',
		awarenessMessage:
			"Ce message faisait partie d'un exercice interne autorisé par la direction. Pas d'inquiétude : il ne s'agit pas d'une faute, mais d'une occasion d'apprendre."
	});
	const sentAt = new Date(Date.now() - daysAgo * DAY);
	const rows: (typeof events.$inferInsert)[] = [];
	const n = c.targets.length;
	c.targets.forEach((t, i) => {
		const r = db
			.insert(campaignRecipients)
			.values({
				campaignId: camp.id,
				targetId: t.id,
				token: randomBytes(32).toString('base64url'),
				sendStatus: 'sent',
				sentAt
			})
			.returning()
			.get();
		const at = (h: number) => new Date(sentAt.getTime() + h * 3_600_000 + i * 97_000);
		STAGES.forEach((type, s) => {
			if (i < counts[s])
				rows.push({ campaignRecipientId: r.id, type, uaCategory: 'desktop', createdAt: at(s + 1) });
		});
		// Reports come mostly from people who did not click (the end of the list).
		if (i >= n - reported)
			rows.push({
				campaignRecipientId: r.id,
				type: 'reported',
				uaCategory: 'desktop',
				createdAt: at(2)
			});
		// A mail scanner opening and following the link, filtered out of the human counts.
		if (i >= counts[2] && i < counts[2] + bots) {
			rows.push({
				campaignRecipientId: r.id,
				type: 'opened',
				isAutomated: true,
				uaCategory: 'bot',
				createdAt: at(0.01)
			});
			rows.push({
				campaignRecipientId: r.id,
				type: 'clicked',
				isAutomated: true,
				uaCategory: 'bot',
				createdAt: at(0.02)
			});
		}
	});
	db.insert(events).values(rows).run();
	db.update(campaigns)
		.set({ status: 'completed', createdAt: sentAt })
		.where(eq(campaigns.id, camp.id))
		.run();
	return camp;
}

const main = await client({
	name: MAIN,
	domain: 'lemanique-demo.example',
	contact: ['Claire Morel', 'claire.morel'],
	size: 48,
	notes: 'Exercices trimestriels validés par la direction. Données fictives.'
});
// Four quarters: fewer clicks, more reports.
await completed(main, 'T1 : facture en attente', 300, [48, 30, 19, 12, 7, 7], 4, 2);
await completed(main, 'T2 : livraison de colis', 210, [48, 31, 14, 9, 5, 5], 8, 1);
await completed(main, 'T3 : mot de passe expiré', 120, [48, 29, 10, 6, 3, 3], 11, 2);
await completed(main, 'T4 : politique de télétravail', 21, [48, 33, 7, 5, 2, 2], 16, 3);
const draft = await createCampaign({
	tenantId: main.tenant.id,
	name: 'T1 2027 : rappel de formation',
	scenarioId: scenario.id,
	sendingProfileId: main.profile.id,
	targetListId: main.list.id,
	trackingDomain: 'https://exercices.demo.example'
});
await createAuthorization({
	tenantId: main.tenant.id,
	campaignId: draft.id,
	reference: 'AUT-DEMO-2027-01',
	validFrom: new Date(),
	validUntil: new Date(Date.now() + 30 * DAY),
	approvedBy: 'Direction (démo)'
});

const clinic = await client({
	name: 'Clinique Démo des Alpes',
	domain: 'clinique-demo.example',
	contact: ['Nadia Perret', 'nadia.perret'],
	size: 24
});
await completed(clinic, 'Exercice de printemps', 90, [24, 15, 6, 4, 2, 2], 5, 1);
await client({
	name: 'Atelier Démo du Jura Sàrl',
	domain: 'atelier-demo.example',
	contact: ['Olivier Bovet', 'olivier.bovet'],
	size: 12
});
await client({
	name: 'Commune Démo de Valbois',
	domain: 'valbois-demo.example',
	contact: ['Laure Gerber', 'laure.gerber'],
	size: 18
});

console.log(
	'Screenshot data ready: 4 fictional clients, 5 completed campaigns, 1 authorized draft.'
);
process.exit(0);
