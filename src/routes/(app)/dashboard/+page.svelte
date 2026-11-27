<script lang="ts">
	import TrendChart from '$lib/components/TrendChart.svelte';
	import FunnelBars from '$lib/components/FunnelBars.svelte';
	import StatusPill from '$lib/components/StatusPill.svelte';
	import { Button, Panel, EmptyState, Page } from '$lib/components/ui';
	import { funnelLabels } from '$lib/funnel-labels';
	import { categoryLabel, difficultyLabel, localeLabel } from '$lib/scenario-labels';
	import { clientSettingsDone, onboardingSteps, showOnboarding } from '$lib/onboarding';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const tenantName = $derived(data.activeTenant?.name ?? '');

	// « Premiers pas » du client actif, seulement tant qu'il n'a lancé aucune campagne.
	const progress = $derived({ ...data, settingsDone: clientSettingsDone(data.activeTenant) });
	const steps = $derived(onboardingSteps(progress, data.activeTenant?.id));
	const onboarding = $derived(showOnboarding(progress));
	const tenant = $derived(data.activeTenant);
	const contact = $derived(
		[tenant?.contactName, tenant?.contactEmail].filter((v) => v?.trim()).join(' · ')
	);

	const pct = (num: number, den: number) => (den > 0 ? Math.round((num / den) * 100) : 0);
	const ratePct = (num: number, den: number) => (den > 0 ? `${pct(num, den)} %` : '—');

	const kpis = $derived.by(() => {
		const a = data.aggregate;
		return [
			{
				label: funnelLabels.recipients,
				value: String(a.recipients),
				hint: `${a.sent} e-mails envoyés`
			},
			{
				label: "Taux d'ouverture",
				value: ratePct(a.opened, a.sent),
				hint: `${a.opened} ${funnelLabels.opened.toLowerCase()}`
			},
			{ label: 'Taux de clic', value: ratePct(a.clicked, a.sent), hint: `${a.clicked} clics` },
			{
				label: funnelLabels.formSubmitted,
				value: String(a.formSubmitted),
				hint: ratePct(a.formSubmitted, a.sent) + ' des envois'
			},
			{
				label: funnelLabels.awarenessViewed,
				value: String(a.awarenessViewed),
				hint: `${a.reported} ${a.reported > 1 ? 'signalements' : 'signalement'}`
			}
		];
	});

	const stages = $derived.by(() => {
		const f = data.featured?.funnel;
		if (!f) return [];
		// La largeur des barres est calculée par FunnelBars à partir de `base` (= sent).
		return [
			{ label: funnelLabels.sent, value: f.sent },
			{ label: funnelLabels.opened, value: f.opened },
			{ label: funnelLabels.clicked, value: f.clicked },
			{ label: funnelLabels.pageInteraction, value: f.pageInteraction },
			{ label: funnelLabels.formSubmitted, value: f.formSubmitted },
			{ label: funnelLabels.awarenessViewed, value: f.awarenessViewed }
		];
	});
</script>

<Page
	title={tenantName || 'Aucun client sélectionné'}
	description={tenant
		? 'Résultats cumulés des campagnes de ce client.'
		: 'Choisissez ou créez un client pour voir ses résultats.'}
>
	{#snippet meta()}
		{#if tenant}
			<span class="rf-meta [overflow-wrap:anywhere]">
				Contact : {contact || '—'} · Fuseau horaire : {tenant.timezone} · Langue : {localeLabel(
					tenant.locale
				)}
			</span>
		{/if}
	{/snippet}
	{#snippet actions()}
		{#if tenant}
			<Button variant="secondary" href={`/tenants/${tenant.id}`}>Paramètres</Button>
		{/if}
		{#if data.campaignCount > 0}
			<Button variant="primary" href="/campaigns/new">Nouvelle campagne</Button>
		{/if}
	{/snippet}

	{#if data.queue}
		<div
			role="status"
			class="rounded-btn border border-l-2 border-line-strong bg-surface-1 px-4 py-3.5"
			style="border-left-color: var(--c-warning)"
		>
			<p class="flex items-center gap-2 font-semibold text-ink">
				<span class="h-2 w-2 shrink-0 rounded-full bg-warning" aria-hidden="true"></span>File
				d'envoi à surveiller
			</p>
			<ul class="mt-1 list-disc pl-5 text-ink-dim">
				{#if data.queue.workerDown}
					<li>
						{data.queue.neverSeen
							? "Le worker n'a jamais donné signe de vie."
							: 'Le worker ne répond plus depuis plusieurs minutes.'}
						Les e-mails ne partiront pas tant qu'il est arrêté.
					</li>
				{/if}
				{#if data.queue.failedJobs > 0}
					<li>
						{data.queue.failedJobs}
						{data.queue.failedJobs > 1 ? 'tâches ont échoué' : 'tâche a échoué'} définitivement.
					</li>
				{/if}
				{#if data.queue.oldestDueMinutes !== null && data.queue.oldestDueMinutes >= 1}
					<li>Plus ancienne tâche en attente : {data.queue.oldestDueMinutes} min.</li>
				{/if}
			</ul>
		</div>
	{/if}

	{#if !data.hasTenant}
		<EmptyState
			title="Créez votre premier client"
			message="Un client est l'entreprise que vous sensibilisez : il regroupe ses destinataires, ses profils d'envoi et ses campagnes. Le menu propose ces rubriques dès qu'un client existe."
		>
			<Button variant="primary" href="/tenants">Créer un client</Button>
		</EmptyState>
	{:else if onboarding}
		<Panel>
			{#snippet header()}
				<h2 class="rf-title">Premiers pas</h2>
			{/snippet}
			<p class="rf-meta mb-3">
				Une campagne combine un scénario, un profil d'envoi et une liste de destinataires. Quatre
				étapes pour lancer la première campagne de « {tenantName} » :
			</p>
			<ol class="flex flex-col gap-1">
				{#each steps as s, i (s.href)}
					<li>
						<a
							href={s.href}
							class="flex min-h-11 items-center gap-3 rounded-md px-1 text-ink hover:bg-surface-2"
						>
							<span
								class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-line-strong font-mono text-[11px]"
								class:text-signal={s.done}
								aria-hidden="true"
							>
								{s.done ? '✓' : i + 1}
							</span>
							<span class="min-w-0 grow [overflow-wrap:anywhere]" class:text-ink-dim={s.done}>
								{s.label}
							</span>
							<span
								class="shrink-0 rf-meta"
								class:text-signal={s.done}
								class:text-ink-dim={!s.done}
							>
								{s.done ? 'Fait' : 'À faire'}
							</span>
						</a>
					</li>
				{/each}
			</ol>
		</Panel>
	{/if}
	{#if data.hasTenant && data.campaignCount > 0}
		<section class="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-5">
			{#each kpis as k (k.label)}
				<div class="rounded-card border border-line bg-surface-1 p-4">
					<p class="rf-label">{k.label}</p>
					<p class="mt-2 text-2xl font-semibold tabular-nums text-ink">{k.value}</p>
					<p class="rf-meta mt-1">{k.hint}</p>
				</div>
			{/each}
		</section>
		<p class="rf-meta -mt-2">
			Le taux d'ouverture est un minimum : certains clients mail (Outlook, Office 365) bloquent le
			pixel de suivi.
		</p>

		<div class="grid items-start gap-4 lg:grid-cols-2">
			{#if data.featured}
				<Panel>
					{#snippet header()}
						<div>
							<h2 class="rf-title">Entonnoir</h2>
							<p class="rf-meta mt-0.5 [overflow-wrap:anywhere]">{data.featured!.name}</p>
						</div>
						<div class="flex flex-wrap items-center gap-3">
							<StatusPill status={data.featured!.status} />
							<Button size="sm" href={`/campaigns/${data.featured!.id}`}>Détail</Button>
						</div>
					{/snippet}

					{#if data.featured.funnel.sent === 0}
						<p class="text-ink-dim">Campagne pas encore lancée, aucune donnée d'entonnoir.</p>
					{:else}
						<FunnelBars {stages} base={data.featured.funnel.sent} />
						<p class="rf-meta mt-4">
							Proportions calculées sur {data.featured.funnel.sent} e-mails envoyés ({data.featured
								.funnel.recipients} destinataires).
						</p>
					{/if}
				</Panel>
			{/if}

			<Panel class={data.featured ? '' : 'lg:col-span-2'}>
				{#snippet header()}
					<h2 class="rf-title">Progression</h2>
				{/snippet}
				{#if data.trend.length < 2}
					<p class="text-ink-dim">
						La progression apparaît à partir de deux campagnes terminées ayant envoyé des e-mails.
					</p>
				{:else}
					<TrendChart points={data.trend} />
				{/if}
			</Panel>
		</div>

		<Panel flush>
			{#snippet header()}
				<h2 class="rf-title">Campagnes</h2>
				<Button size="sm" variant="ghost" href="/campaigns">Toutes les campagnes</Button>
			{/snippet}
			<ul class="divide-y divide-line md:hidden">
				{#each data.rows as r (r.id)}
					<li class="flex flex-col gap-2 px-4 py-3">
						<div class="flex items-start justify-between gap-3">
							<a
								href={`/campaigns/${r.id}`}
								class="min-w-0 font-medium [overflow-wrap:anywhere] text-ink hover:underline"
							>
								{r.name}
							</a>
							<StatusPill status={r.status} />
						</div>
						{#if r.scenarioMeta}
							<div class="rf-meta">
								<a
									href={`/scenarios/${encodeURIComponent(r.scenarioMeta.key)}`}
									class="text-ink hover:underline"
								>
									{r.scenarioMeta.title}
								</a>
								<span class="[overflow-wrap:anywhere]">
									· {categoryLabel(r.scenarioMeta.category)} · {difficultyLabel(
										r.scenarioMeta.difficulty
									)} · {localeLabel(r.scenarioMeta.locale)}
								</span>
							</div>
						{/if}
						<dl class="rf-meta grid grid-cols-3 gap-2">
							<div>
								<dt class="text-ink-dim">Envoyés</dt>
								<dd class="text-ink">{r.funnel.sent}</dd>
							</div>
							<div>
								<dt class="text-ink-dim">Clics</dt>
								<dd class="text-ink">{r.funnel.clicked}</dd>
							</div>
							<div>
								<dt class="text-ink-dim">Formulaires</dt>
								<dd class="text-ink">{r.funnel.formSubmitted}</dd>
							</div>
						</dl>
						<div class="flex items-center gap-2">
							<div class="h-1.5 grow overflow-hidden rounded-flat bg-surface-2">
								<div
									class="h-1.5 rounded-flat bg-ink-dim"
									style="width: {pct(r.funnel.opened, r.funnel.sent)}%"
								></div>
							</div>
							<span class="rf-meta whitespace-nowrap">
								Ouverts {ratePct(r.funnel.opened, r.funnel.sent)}
							</span>
						</div>
					</li>
				{/each}
			</ul>
			<div class="hidden overflow-x-auto md:block">
				<table class="w-full text-left">
					<thead class="border-b border-line">
						<tr>
							<th class="rf-label px-4 py-2.5">Nom</th>
							<th class="rf-label px-4 py-2.5">Scénario</th>
							<th class="rf-label px-4 py-2.5">Statut</th>
							<th class="rf-label px-4 py-2.5 text-right">Envoyés</th>
							<th class="rf-label px-4 py-2.5 text-right">Clics</th>
							<th class="rf-label px-4 py-2.5 text-right">Formulaires soumis</th>
							<th class="rf-label px-4 py-2.5">Ouverts</th>
						</tr>
					</thead>
					<tbody class="divide-y divide-line">
						{#each data.rows as r (r.id)}
							<tr class="hover:bg-surface-2">
								<td class="px-4 py-3">
									<a href={`/campaigns/${r.id}`} class="font-medium text-ink hover:underline">
										{r.name}
									</a>
								</td>
								<td class="px-4 py-3">
									{#if r.scenarioMeta}
										<a
											href={`/scenarios/${encodeURIComponent(r.scenarioMeta.key)}`}
											class="font-medium text-ink hover:underline"
										>
											{r.scenarioMeta.title}
										</a>
										<p class="mt-0.5 rf-meta">
											{categoryLabel(r.scenarioMeta.category)} · {difficultyLabel(
												r.scenarioMeta.difficulty
											)} · {localeLabel(r.scenarioMeta.locale)}
										</p>
									{:else}
										<span class="text-ink-dim">—</span>
									{/if}
								</td>
								<td class="px-4 py-3"><StatusPill status={r.status} /></td>
								<td class="px-4 py-3 text-right text-ink">{r.funnel.sent}</td>
								<td class="px-4 py-3 text-right text-ink">{r.funnel.clicked}</td>
								<td class="px-4 py-3 text-right text-ink">{r.funnel.formSubmitted}</td>
								<td class="px-4 py-3">
									<div class="flex items-center gap-2">
										<div class="h-1.5 w-20 overflow-hidden rounded-flat bg-surface-2">
											<div
												class="h-1.5 rounded-flat bg-ink-dim"
												style="width: {pct(r.funnel.opened, r.funnel.sent)}%"
											></div>
										</div>
										<span class="rf-meta whitespace-nowrap">
											{ratePct(r.funnel.opened, r.funnel.sent)}
										</span>
									</div>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</Panel>
	{/if}
</Page>
