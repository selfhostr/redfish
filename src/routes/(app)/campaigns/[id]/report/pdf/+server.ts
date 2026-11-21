import { error, redirect } from '@sveltejs/kit';
import { getCampaign } from '$lib/server/campaigns';
import { assertTenantAccess } from '$lib/server/tenant';
import { buildReport, type ReportData } from '$lib/server/reports/report';
import type { RequestHandler } from './$types';

// v1 : pas de chromium dans l'image. On renvoie un document HTML autonome,
// optimisé pour l'impression, que l'opérateur enregistre en PDF
// (Imprimer > Enregistrer au format PDF). Pas de script en ligne : la CSP
// stricte le bloquerait (les réponses d'endpoint ne reçoivent pas de nonce). Un vrai PDF serveur (Playwright/chromium)
// est une étape ultérieure.
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const pct = (r: number) => `${Math.round(r * 100)} %`;

function render(r: ReportData): string {
	const li = (a: string[]) => a.map((x) => `<li>${esc(x)}</li>`).join('');
	const rows = (r.details ?? [])
		.map((d) => `<tr><td>${esc(d.name)}</td><td>${esc(d.email)}</td><td>${esc(d.stage)}</td></tr>`)
		.join('');
	return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Rapport : ${esc(r.campaignName)}</title>
<style>@page{size:A4;margin:18mm}body{font:14px/1.5 system-ui,sans-serif;color:#111;max-width:780px;margin:0 auto;padding:16px}
table{border-collapse:collapse;width:100%}td,th{border:1px solid #ccc;padding:4px 8px;text-align:left}h2{margin-top:1.5em;break-after:avoid}</style></head><body>
<h1>Rapport de campagne : ${esc(r.campaignName)}</h1>
<p>Généré le ${esc(r.generatedAt)}${r.anonymized ? ', données anonymisées' : ''}</p>
<h2>Indicateurs</h2><table>
<tr><th>Destinataires</th><td>${r.counts.recipients}</td></tr>
<tr><th>Envoyés</th><td>${r.counts.sent}</td></tr>${r.counts.failed > 0 ? `\n<tr><th>Échecs</th><td>${r.counts.failed} envois en échec</td></tr>` : ''}
<tr><th>Ouvertures</th><td>${r.counts.opened} (${pct(r.rates.open)})</td></tr>
<tr><th>Clics</th><td>${r.counts.clicked} (${pct(r.rates.click)})</td></tr>
<tr><th>Soumissions</th><td>${r.counts.formSubmitted} (${pct(r.rates.submission)})</td></tr>
<tr><th>Sensibilisation vue</th><td>${r.counts.awarenessViewed} (${pct(r.rates.awareness)})</td></tr>
<tr><th>Signalements</th><td>${r.counts.reported} (${pct(r.rates.report)})</td></tr></table>
<h2>Points d'attention</h2><ul>${li(r.attentionPoints)}</ul>
<h2>Recommandations</h2><ul>${li(r.recommendations)}</ul>
${r.details ? `<h2>Détail</h2><table><tr><th>Nom</th><th>E-mail</th><th>Étape atteinte</th></tr>${rows}</table>` : ''}
</body></html>`;
}

export const GET: RequestHandler = async ({ locals, params, url }) => {
	if (!locals.user) throw redirect(303, '/login');
	const campaign = await getCampaign(params.id);
	if (!campaign) throw error(404, 'Campagne introuvable');
	await assertTenantAccess(locals.user, campaign.tenantId);
	const report = await buildReport(campaign.id, {
		anonymize: url.searchParams.get('detail') !== '1'
	});
	return new Response(render(report), {
		headers: {
			'content-type': 'text/html; charset=utf-8',
			'cache-control': 'private, no-store',
			'x-robots-tag': 'noindex'
		}
	});
};
