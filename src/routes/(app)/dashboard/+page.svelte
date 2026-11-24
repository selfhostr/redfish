<script lang="ts">
	import TrendChart from '$lib/components/TrendChart.svelte';
	import StatusPill from '$lib/components/StatusPill.svelte';
	import { Button, Panel, EmptyState, CopyButton } from '$lib/components/ui';
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
	const ratePct = (num: number, den: number) => (den > 0 ? `${pct(num, den)} %` : 'n/d');

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
		const base = Math.max(f.sent, 1);
		return [
			{ label: funnelLabels.sent, value: f.sent },
			{ label: funnelLabels.opened, value: f.opened },
			{ label: funnelLabels.clicked, value: f.clicked },
			{ label: funnelLabels.pageInteraction, value: f.pageInteraction },
			{ label: funnelLabels.formSubmitted, value: f.formSubmitted },
			{ label: funnelLabels.awarenessViewed, value: f.awarenessViewed }
		].map((s) => ({ ...s, width: Math.round((s.value / base) * 100) }));
	});
</script>

<main class="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-6 md:px-6 md:py-8">
	<header class="flex flex-wrap items-end justify-between gap-4">
		<div class="min-w-0">
			<p class="rf-eyebrow">Tableau de bord</p>
			<h1 class="mt-1 text-2xl font-semibold tracking-tight [overflow-wrap:anywhere] text-ink">
				{#if tenantName}{tenantName}{:else}Aucun client sélectionné{/if}
			</h1>
			{#if tenant}
				<p class="mt-1 text-sm text-ink-dim [overflow-wrap:anywhere]">
					Contact : {contact || 'non renseigné'} · Fuseau horaire : {tenant.timezone} · Langue : {localeLabel(
						tenant.locale
					)}
				</p>
			{/if}
		</div>
		<div class="flex flex-wrap gap-2">
			{#if tenant}
				<Button variant="secondary" href={`/tenants/${tenant.id}`}>Paramètres</Button>
			{/if}
			{#if data.campaignCount > 0}
				<Button variant="primary" href="/campaigns/new">Nouvelle campagne</Button>
			{/if}
		</div>
	</header>

	{#if data.queue}
		<div
			role="status"
			class="rounded-card border border-l-2 border-line bg-surface-1 p-4 text-sm"
			style="border-left-color: var(--c-warning)"
		>
			<p class="font-semibold text-ink">File d'envoi à surveiller</p>
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
				<h2 class="rf-eyebrow">Premiers pas</h2>
			{/snippet}
			<p class="mb-3 text-ink-dim">
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
								class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-line-strong font-mono text-xs"
								class:text-signal={s.done}
								aria-hidden="true"
							>
								{s.done ? '✓' : i + 1}
							</span>
							<span class="min-w-0 grow [overflow-wrap:anywhere]" class:text-ink-dim={s.done}>
								{s.label}
							</span>
							<span
								class="shrink-0 text-xs"
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
		<p class="text-ink-dim">Cumul des indicateurs sur toutes les campagnes du client.</p>
		<section class="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
			{#each kpis as k (k.label)}
				<div class="rounded-card border border-line bg-surface-1 p-4">
					<p class="rf-eyebrow">{k.label}</p>
					<p class="mt-2 text-2xl font-semibold tracking-tight text-ink">{k.value}</p>
					<p class="mt-1 text-xs text-ink-dim">{k.hint}</p>
				</div>
			{/each}
		</section>
		<p class="text-xs text-ink-dim">
			Le taux d'ouverture est un plancher : l'ouverture repose sur un pixel que de nombreux clients
			mail (Outlook, Office 365) bloquent par défaut. Un clic ou une interaction compte comme une
			ouverture ; une ouverture sans clic peut passer inaperçue.
		</p>

		{#if data.featured}
			<p class="text-ink-dim">
				Entonnoir de la campagne mise en avant : de l'envoi à la sensibilisation.
			</p>
			<Panel>
				{#snippet header()}
					<div>
						<h2 class="rf-eyebrow">Entonnoir</h2>
						<p class="mt-1 font-semibold text-ink">{data.featured!.name}</p>
					</div>
					<div class="flex flex-wrap items-center gap-3">
						<StatusPill status={data.featured!.status} />
						<Button size="sm" href={`/campaigns/${data.featured!.id}`}>Détail</Button>
					</div>
				{/snippet}

				{#if data.featured.funnel.sent === 0}
					<p class="text-ink-dim">Campagne pas encore lancée, aucune donnée d'entonnoir.</p>
				{:else}
					<div class="flex flex-col gap-3">
						{#each stages as s (s.label)}
							<div class="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 md:flex md:gap-3">
								<span class="text-ink-dim md:w-40 md:shrink-0">{s.label}</span>
								<span class="text-right text-ink md:order-last md:w-24 md:shrink-0">
									{s.value} · {s.width} %
								</span>
								<div
									class="col-span-2 h-4 overflow-hidden rounded-flat bg-surface-2 md:col-auto md:grow"
								>
									<div
										class="h-4 rounded-flat bg-ink-dim"
										style="width: {Math.max(s.width, s.value > 0 ? 2 : 0)}%"
									></div>
								</div>
							</div>
						{/each}
					</div>
					<p class="mt-4 text-xs text-ink-dim">
						Proportions calculées sur {data.featured.funnel.sent} e-mails envoyés ({data.featured
							.funnel.recipients} destinataires).
					</p>
				{/if}
			</Panel>
		{/if}

		<Panel>
			{#snippet header()}
				<h2 class="rf-eyebrow">Progression</h2>
			{/snippet}
			{#if data.trend.length < 2}
				<p class="text-ink-dim">
					La progression apparaît à partir de deux campagnes terminées ayant envoyé des e-mails.
				</p>
			{:else}
				<TrendChart points={data.trend} />
			{/if}
		</Panel>

		<p class="text-ink-dim">Chaque campagne avec son scénario, son statut et ses résultats.</p>
		<Panel flush>
			{#snippet header()}
				<h2 class="rf-eyebrow">Campagnes</h2>
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
							<div class="text-xs text-ink-dim">
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
						<dl class="grid grid-cols-3 gap-2 text-xs">
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
							<span class="text-xs whitespace-nowrap text-ink-dim">
								Ouverts {ratePct(r.funnel.opened, r.funnel.sent)}
							</span>
						</div>
					</li>
				{/each}
			</ul>
			<div class="hidden overflow-x-auto md:block">
				<table class="w-full text-left">
					<thead class="border-b border-line bg-surface-2">
						<tr>
							<th class="rf-label px-4 py-3 font-medium">Nom</th>
							<th class="rf-label px-4 py-3 font-medium">Scénario</th>
							<th class="rf-label px-4 py-3 font-medium">Statut</th>
							<th class="rf-label px-4 py-3 text-right font-medium">Envoyés</th>
							<th class="rf-label px-4 py-3 text-right font-medium">Clics</th>
							<th class="rf-label px-4 py-3 text-right font-medium">Formulaires soumis</th>
							<th class="rf-label px-4 py-3 font-medium">Ouverts</th>
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
										<p
											class="mt-0.5 flex items-center gap-1 font-mono text-xs whitespace-nowrap text-ink-dim"
										>
											{r.scenarioMeta.key}
											<CopyButton value={r.scenarioMeta.key} what="la clé du scénario" />
										</p>
										<p class="mt-0.5 text-xs text-ink-dim">
											{categoryLabel(r.scenarioMeta.category)} · {difficultyLabel(
												r.scenarioMeta.difficulty
											)} · {localeLabel(r.scenarioMeta.locale)}
										</p>
									{:else}
										<span class="text-ink-dim">n/d</span>
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
										<span class="text-xs whitespace-nowrap text-ink-dim">
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
</main>
