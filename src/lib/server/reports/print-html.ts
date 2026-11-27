import { formatZoned } from '$lib/timezone';
import { funnelLabels, reportFunnelStages } from '$lib/funnel-labels';
import type { ReportData, ReportSummary } from './report';

// Document HTML autonome, optimisé pour l'impression (Imprimer > Enregistrer au
// format PDF). Fonction PURE, sans dépendance SvelteKit server, pour partager le
// MÊME contenu que la vue écran. Pas de script en ligne : la CSP stricte le
// bloquerait. Tout texte dynamique passe par esc().
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const pct = (r: number) => `${Math.round(r * 100)} %`;

/** Couleurs du bandeau de verdict, assombries pour rester lisibles sur blanc. */
const TONE_ACCENT: Record<ReportSummary['tone'], string> = {
	positive: '#1a7f4b',
	warning: '#9a6a00',
	critical: '#b3261e',
	neutral: '#555555'
};

function funnelBars(r: ReportData): string {
	const base = Math.max(r.counts.sent, 1);
	return reportFunnelStages(r.counts)
		.map((s) => {
			const width = Math.round((s.value / base) * 100);
			const fill = Math.max(width, s.value > 0 ? 2 : 0);
			const note = s.note ? `<span class="fnote">${esc(s.note)}</span>` : '';
			return (
				`<div class="frow"><div class="flabel">${esc(s.label)}${note}</div>` +
				`<div class="fbar"><div class="ffill" style="width:${fill}%"></div></div>` +
				`<div class="fval">${s.value} &#183; ${width} %</div></div>`
			);
		})
		.join('');
}

function header(r: ReportData): string {
	const b = r.branding;
	const metaBits = [
		`Scénario : ${esc(b.scenario)}`,
		`Généré le ${esc(formatZoned(new Date(r.generatedAt), r.timezone, 'date'))}`
	];
	if (r.anonymized) metaBits.push('données anonymisées');
	const issuer = b.issuerName
		? `<p class="party">Émis par : ${esc(b.issuerName)}${b.issuerContact ? ` &#183; ${esc(b.issuerContact)}` : ''}</p>`
		: '';
	const client = b.clientName
		? `<p class="party">Client : ${esc(b.clientName)}${b.clientContact ? ` &#183; ${esc(b.clientContact)}` : ''}</p>`
		: '';
	return `<header>
<h1>Rapport de campagne : ${esc(r.campaignName)}</h1>
<p class="meta">${metaBits.join(' &#183; ')}</p>
${issuer}${client}
</header>`;
}

function summary(r: ReportData): string {
	const s = r.summary;
	const accent = TONE_ACCENT[s.tone];
	const secondary = s.secondaryFigure
		? `<div class="kf-secondary"><span class="kf-sval">${esc(s.secondaryFigure.value)}</span> <span class="kf-slabel">${esc(s.secondaryFigure.label)}</span></div>`
		: '';
	const reco = s.topRecommendation
		? `<p class="reco">Recommandation prioritaire : ${esc(s.topRecommendation)}</p>`
		: '';
	return `<section class="summary block">
<div class="verdict" style="border-left-color:${accent};color:${accent}">${esc(s.verdict)}</div>
<div class="keyfig">
<div class="kf-main"><span class="kf-value">${esc(s.keyFigure.value)}</span><span class="kf-label">${esc(s.keyFigure.label)}</span></div>
${secondary}
</div>
${reco}
</section>`;
}

export function renderReportHtml(r: ReportData): string {
	const li = (a: string[]) => a.map((x) => `<li>${esc(x)}</li>`).join('');
	const rows = (r.details ?? [])
		.map((d) => `<tr><td>${esc(d.name)}</td><td>${esc(d.email)}</td><td>${esc(d.stage)}</td></tr>`)
		.join('');
	const failedRow =
		r.counts.failed > 0
			? `<tr><th>Échecs</th><td>${r.counts.failed} envois en échec</td></tr>`
			: '';
	return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Rapport : ${esc(r.campaignName)}</title>
<style>
@page{size:A4;margin:18mm}
body{font:14px/1.5 system-ui,sans-serif;color:#111;max-width:780px;margin:0 auto;padding:16px;font-variant-numeric:tabular-nums}
h1{font-size:22px;margin:0 0 4px}
h2{font-size:16px;margin:1.5em 0 .4em;break-after:avoid}
.meta{color:#555;margin:0 0 2px}
.party{margin:0;color:#333}
.intro{color:#555;margin:.2em 0 .6em}
table{border-collapse:collapse;width:100%}
td,th{border:1px solid #ccc;padding:4px 8px;text-align:left}
ul{margin:.3em 0;padding-left:1.4em}
.block{break-inside:avoid}
.summary{margin-top:1.4em;border:1px solid #ddd;border-radius:8px;padding:14px 16px}
.verdict{border-left:4px solid #555;padding:4px 0 4px 12px;font-size:15px;font-weight:600}
.keyfig{display:flex;align-items:baseline;gap:28px;margin-top:12px}
.kf-main{display:flex;flex-direction:column}
.kf-value{font-size:44px;font-weight:700;line-height:1}
.kf-label{color:#555;font-size:13px;margin-top:2px}
.kf-secondary{color:#333}
.kf-sval{font-size:22px;font-weight:600}
.kf-slabel{color:#555;font-size:13px}
.reco{margin:12px 0 0;font-weight:600}
.funnel{margin:.4em 0}
.frow{display:flex;align-items:center;gap:10px;margin:6px 0;break-inside:avoid}
.flabel{width:180px;flex:none;color:#333}
.fnote{display:block;color:#777;font-size:11px}
.fbar{flex:1;height:14px;background:#fff;border:1px solid #c8c8c8;border-radius:4px;overflow:hidden}
.ffill{height:14px;background:#222}
.fval{width:110px;flex:none;text-align:right;color:#111}
</style></head><body>
${header(r)}
${summary(r)}
<h2>Entonnoir</h2>
<p class="intro">Du nombre d'envois jusqu'aux signalements, part de chaque étape sur les ${r.counts.sent} e-mails envoyés.</p>
<div class="funnel block">${funnelBars(r)}</div>
<h2>Indicateurs</h2>
<table class="block">
<tr><th>${funnelLabels.recipients}</th><td>${r.counts.recipients}</td></tr>
<tr><th>${funnelLabels.sent}</th><td>${r.counts.sent}</td></tr>${failedRow ? `\n${failedRow}` : ''}
<tr><th>Ouvertures</th><td>${r.counts.opened} (${pct(r.rates.open)})</td></tr>
<tr><th>${funnelLabels.clicked}</th><td>${r.counts.clicked} (${pct(r.rates.click)})</td></tr>
<tr><th>${funnelLabels.formSubmitted}</th><td>${r.counts.formSubmitted} (${pct(r.rates.submission)})</td></tr>
<tr><th>${funnelLabels.awarenessViewed}</th><td>${r.counts.awarenessViewed} (${pct(r.rates.awareness)})</td></tr>
<tr><th>${funnelLabels.reported}</th><td>${r.counts.reported} (${pct(r.rates.report)})</td></tr></table>
<p class="intro">Le taux d'ouverture est un plancher : l'ouverture repose sur un pixel que de nombreux clients mail (Outlook, Office 365) bloquent par défaut. Un clic ou une interaction compte comme une ouverture.</p>
<h2>Points d'attention</h2><ul class="block">${li(r.attentionPoints)}</ul>
<h2>Recommandations</h2><ul class="block">${li(r.recommendations)}</ul>
${r.details ? `<h2>Détail</h2><table class="block"><tr><th>Nom</th><th>E-mail</th><th>Étape atteinte</th></tr>${rows}</table>` : ''}
</body></html>`;
}
