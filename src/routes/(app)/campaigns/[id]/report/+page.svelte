<script lang="ts">
	import { funnelLabels, reportFunnelStages } from '$lib/funnel-labels';
	import { Button, LocalTime, Plate } from '$lib/components/ui';
	import FunnelBars from '$lib/components/FunnelBars.svelte';
	import type { PageData } from './$types';
	let { data }: { data: PageData } = $props();
	const r = $derived(data.report);
	const pct = (x: number) => `${Math.round(x * 100)} %`;

	// Tonalité du verdict → variant de Plate (point + mot + couleur) et mot d'étiquette.
	const toneVariant = {
		positive: 'signal',
		warning: 'advisory',
		critical: 'warning',
		neutral: 'neutral'
	} as const;
	const toneWord = {
		positive: 'Point positif',
		warning: 'Vigilance',
		critical: 'Préoccupant',
		neutral: 'À noter'
	} as const;

	const stages = $derived(reportFunnelStages(r.counts));
</script>

<main class="report mx-auto max-w-[52rem] p-4 md:p-6">
	<nav class="no-print mb-6 flex gap-3 max-md:flex-col md:gap-4 [&>*]:max-md:w-full">
		<Button variant="primary" onclick={() => window.print()}>Imprimer</Button>
		<Button href="report/pdf?print=1{r.anonymized ? '' : '&detail=1'}" target="_blank">
			Version PDF (imprimer en PDF)
		</Button>
		{#if r.anonymized}<Button variant="ghost" href="?detail=1">
				Avec détail nominatif
			</Button>{:else}<Button variant="ghost" href="?">Anonymiser</Button>{/if}
	</nav>

	<header class="block">
		<h1 class="rf-page-title">Rapport de campagne : {r.campaignName}</h1>
		<p class="rf-meta mt-1">
			Scénario : {r.branding.scenario} · Généré le <LocalTime
				value={r.generatedAt}
				timeZone={r.timezone}
				mode="date"
			/>{r.anonymized ? ' · données anonymisées' : ''}
		</p>
		{#if r.branding.issuerName}
			<p class="rf-meta">
				Émis par : {r.branding.issuerName}{r.branding.issuerContact
					? ` · ${r.branding.issuerContact}`
					: ''}
			</p>
		{/if}
		{#if r.branding.clientName}
			<p class="rf-meta">
				Client : {r.branding.clientName}{r.branding.clientContact
					? ` · ${r.branding.clientContact}`
					: ''}
			</p>
		{/if}
	</header>

	<section class="summary block {toneVariant[r.summary.tone]}">
		<Plate variant={toneVariant[r.summary.tone]}>{toneWord[r.summary.tone]}</Plate>
		<p class="verdict mt-2">{r.summary.verdict}</p>
		<div class="mt-4 flex flex-wrap items-baseline gap-x-10 gap-y-2">
			<div class="flex flex-col">
				<span class="text-5xl font-semibold tabular-nums text-ink">
					{r.summary.keyFigure.value}
				</span>
				<span class="rf-label mt-1">{r.summary.keyFigure.label}</span>
			</div>
			{#if r.summary.secondaryFigure}
				<div class="flex flex-col">
					<span class="text-2xl font-semibold tabular-nums text-ink">
						{r.summary.secondaryFigure.value}
					</span>
					<span class="rf-label mt-1">{r.summary.secondaryFigure.label}</span>
				</div>
			{/if}
		</div>
		{#if r.summary.topRecommendation}
			<p class="mt-4 font-medium text-ink">
				Recommandation prioritaire : {r.summary.topRecommendation}
			</p>
		{/if}
	</section>

	<h2 class="rf-title mt-8 mb-1">Entonnoir</h2>
	<p class="rf-meta mb-3">
		Part de chaque étape sur les {r.counts.sent} e-mails envoyés, de l'envoi jusqu'aux signalements.
	</p>
	<div class="block">
		<FunnelBars {stages} base={r.counts.sent} />
	</div>

	<p class="rf-meta mt-8">Résultats détaillés, du nombre de destinataires aux signalements.</p>
	<h2 class="rf-title mt-1 mb-2">Indicateurs</h2>
	<table class="block">
		<tbody>
			<tr><th>{funnelLabels.recipients}</th><td>{r.counts.recipients}</td></tr>
			<tr><th>{funnelLabels.sent}</th><td>{r.counts.sent}</td></tr>
			{#if r.counts.failed > 0}
				<tr><th>Échecs</th><td>{r.counts.failed} envois en échec</td></tr>
			{/if}
			<tr><th>{funnelLabels.opened}</th><td>{r.counts.opened} ({pct(r.rates.open)})</td></tr>
			<tr><th>{funnelLabels.clicked}</th><td>{r.counts.clicked} ({pct(r.rates.click)})</td></tr>
			<tr>
				<th>{funnelLabels.formSubmitted}</th><td>
					{r.counts.formSubmitted} ({pct(r.rates.submission)})
				</td>
			</tr>
			<tr>
				<th>{funnelLabels.awarenessViewed}</th><td>
					{r.counts.awarenessViewed} ({pct(r.rates.awareness)})
				</td>
			</tr>
			<tr><th>{funnelLabels.reported}</th><td>{r.counts.reported} ({pct(r.rates.report)})</td></tr>
		</tbody>
	</table>
	<p class="rf-meta mt-2">
		Le taux d'ouverture est un plancher : l'ouverture repose sur un pixel que de nombreux clients
		mail (Outlook, Office 365) bloquent par défaut. Un clic ou une interaction compte comme une
		ouverture ; une ouverture sans clic peut passer inaperçue.
	</p>

	<h2 class="rf-title mt-6">Points d'attention</h2>
	<p class="rf-meta mb-2">Éléments à surveiller relevés dans les résultats.</p>
	<ul class="block list-disc pl-6">
		{#each r.attentionPoints as p}<li>{p}</li>{/each}
	</ul>
	<h2 class="rf-title mt-6">Recommandations</h2>
	<p class="rf-meta mb-2">Actions proposées pour la suite.</p>
	<ul class="block list-disc pl-6">
		{#each r.recommendations as p}<li>{p}</li>{/each}
	</ul>

	{#if r.details}
		<h2 class="rf-title mt-6">Détail</h2>
		<p class="rf-meta mb-2">Étape atteinte par chaque destinataire.</p>
		<div class="table-scroll">
			<table>
				<thead><tr><th>Nom</th><th>E-mail</th><th>Étape atteinte</th></tr></thead>
				<tbody>
					{#each r.details as d}<tr>
							<td>{d.name}</td><td>{d.email}</td><td>{d.stage}</td>
						</tr>{/each}
				</tbody>
			</table>
		</div>
	{/if}
</main>

<style>
	.report {
		color: var(--c-ink);
	}
	.table-scroll {
		overflow-x: auto;
	}
	table {
		border-collapse: collapse;
		width: 100%;
	}
	th,
	td {
		border: 1px solid var(--c-line-strong);
		padding: 8px 12px;
		text-align: left;
		overflow-wrap: anywhere;
	}
	h2 {
		break-after: avoid;
	}

	/* Résumé exécutif : encadré fort, accent coloré à gauche selon la tonalité. */
	.summary {
		margin-top: 1.5rem;
		border: 1px solid var(--c-line-strong);
		border-left-width: 4px;
		border-radius: var(--r-card);
		padding: 1rem 1.25rem;
		background: var(--c-surface-1);
	}
	.summary.signal {
		border-left-color: var(--c-signal);
	}
	.summary.advisory {
		border-left-color: var(--c-advisory);
	}
	.summary.warning {
		border-left-color: var(--c-warning);
	}
	.summary.neutral {
		border-left-color: var(--c-ink-dim);
	}
	.verdict {
		font-size: 1.0625rem;
		font-weight: 600;
		line-height: 1.35;
		color: var(--c-ink);
	}

	@media print {
		@page {
			size: A4;
			margin: 18mm;
		}
		:global(body),
		.report {
			background: #ffffff;
			color: #000000;
		}
		th,
		td {
			border-color: #666666;
		}
		.no-print {
			display: none;
		}
		main {
			max-width: none;
			padding: 0;
		}
		/* Ne jamais couper ces blocs entre deux pages. */
		.block,
		table,
		ul {
			break-inside: avoid;
		}
		h1,
		h2 {
			break-after: avoid;
		}
		/* Verdict lisible sur papier : accent conservé, fond blanc, texte foncé. */
		.summary {
			background: #ffffff;
			border-color: #999999;
		}
		.summary.signal {
			border-left-color: #1a7f4b;
		}
		.summary.advisory {
			border-left-color: #9a6a00;
		}
		.summary.warning {
			border-left-color: #b3261e;
		}
		.summary.neutral {
			border-left-color: #555555;
		}
		.verdict {
			color: #000000;
		}
	}
</style>
