<script lang="ts">
	import { funnelLabels } from '$lib/funnel-labels';
	import { Button, LocalTime } from '$lib/components/ui';
	import type { PageData } from './$types';
	let { data }: { data: PageData } = $props();
	const r = $derived(data.report);
	const pct = (x: number) => `${Math.round(x * 100)} %`;
</script>

<main class="report mx-auto max-w-[52rem] p-4 md:p-6">
	<div class="flex flex-col">
		<nav
			class="no-print order-last mt-4 mb-4 flex gap-3 md:order-none md:mt-0 max-md:flex-col md:gap-4 [&>*]:max-md:w-full"
		>
			<Button variant="primary" onclick={() => window.print()}>Imprimer</Button>
			<Button href="report/pdf?print=1{r.anonymized ? '' : '&detail=1'}" target="_blank">
				Version PDF (imprimer en PDF)
			</Button>
			{#if r.anonymized}<Button variant="ghost" href="?detail=1">
					Avec détail nominatif
				</Button>{:else}<Button variant="ghost" href="?">Anonymiser</Button>{/if}
		</nav>
		<h1 class="rf-page-title">Rapport de campagne : {r.campaignName}</h1>
		<p class="rf-meta mt-1">
			Généré le <LocalTime value={r.generatedAt} timeZone={r.timezone} />{r.anonymized
				? ', données anonymisées'
				: ''}
		</p>
	</div>

	<p class="rf-meta mt-6">Résultats de la campagne, du nombre de destinataires aux signalements.</p>
	<h2 class="rf-title mt-3 mb-2">Indicateurs</h2>
	<table>
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
	<ul class="list-disc pl-6">
		{#each r.attentionPoints as p}<li>{p}</li>{/each}
	</ul>
	<h2 class="rf-title mt-6">Recommandations</h2>
	<p class="rf-meta mb-2">Actions proposées pour la suite.</p>
	<ul class="list-disc pl-6">
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
	@media print {
		@page {
			size: A4;
			margin: 18mm;
		}
		:global(body),
		.report {
			background: rgb(255 255 255);
			color: rgb(0 0 0);
		}
		th,
		td {
			border-color: rgb(0 0 0 / 0.4);
		}
		.no-print {
			display: none;
		}
		main {
			max-width: none;
			padding: 0;
		}
	}
</style>
