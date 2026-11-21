<script lang="ts">
	import ClientHeader from '$lib/components/ClientHeader.svelte';
	import StatusPill from '$lib/components/StatusPill.svelte';
	import { Button, EmptyState, LocalTime, Panel } from '$lib/components/ui';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const o = $derived(data.isActive ? data.overview : null);
	const steps = $derived(
		o
			? [
					{ done: o.listCount > 0, label: 'Créer une liste de destinataires', href: '/lists' },
					{
						done: o.profileCount > 0,
						label: "Ajouter un profil d'envoi",
						href: '/sending-profiles'
					},
					{
						done: o.campaignCount > 0,
						label: 'Lancer une première campagne',
						href: '/campaigns/new'
					}
				]
			: []
	);
	const complete = $derived(steps.length > 0 && steps.every((s) => s.done));
	const pct = (r: number | null) => (r === null ? '—' : `${Math.round(r * 100)} %`);
</script>

<main class="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-6 md:px-6 md:py-8">
	{#if !data.isActive}
		<h1 class="text-2xl font-semibold tracking-tight [overflow-wrap:anywhere] text-ink">
			{data.tenant.name}
		</h1>
		<Panel>
			{#snippet header()}
				<h2 class="rf-label">Activer ce client</h2>
			{/snippet}
			<form method="POST" action="/set-tenant" class="flex flex-col gap-4">
				<input type="hidden" name="tenantId" value={data.tenant.id} />
				<input type="hidden" name="redirectTo" value="/tenants/{data.tenant.id}" />
				<p class="text-ink-dim">
					Ce client n'est pas celui sur lequel vous travaillez. Activez-le pour consulter sa fiche.
				</p>
				<Button type="submit" variant="primary" class="w-full md:w-auto md:self-start">
					Activer ce client
				</Button>
			</form>
		</Panel>
	{:else if o}
		<ClientHeader />

		{#if !complete}
			<Panel>
				{#snippet header()}
					<h2 class="rf-label">Pour démarrer</h2>
				{/snippet}
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

		<dl class="grid grid-cols-2 gap-3 md:grid-cols-4">
			{#each [['Campagnes', String(o.campaignCount)], ['Listes', String(o.listCount)], ['Destinataires', String(o.recipientCount)], ['Taux de clic', pct(o.lastClickRate)]] as [k, v] (k)}
				<div class="rounded-md border border-line bg-surface-1 px-4 py-3">
					<dt class="rf-label">{k}</dt>
					<dd class="text-xl font-semibold text-ink">{v}</dd>
				</div>
			{/each}
		</dl>

		<div class="flex flex-wrap items-center justify-between gap-3">
			<h2 class="text-lg font-semibold tracking-tight text-ink">Dernières campagnes</h2>
			<Button variant="primary" href="/campaigns/new" class="max-md:w-full">
				Nouvelle campagne
			</Button>
		</div>

		{#if data.latest.length === 0}
			<EmptyState
				title="Aucune campagne"
				message="Les campagnes de ce client apparaîtront ici dès la première création."
			/>
		{:else}
			<ul class="flex flex-col gap-3">
				{#each data.latest as c (c.id)}
					<li>
						<a
							href={`/campaigns/${c.id}`}
							class="flex flex-col gap-2 rounded-md border border-line bg-surface-1 px-4 py-3 hover:bg-surface-2"
						>
							<span class="flex items-start justify-between gap-3">
								<span class="min-w-0 font-medium break-words text-ink">{c.name}</span>
								<span class="shrink-0"><StatusPill status={c.status} /></span>
							</span>
							<span class="text-ink-dim">Créée le <LocalTime value={c.createdAt} /></span>
						</a>
					</li>
				{/each}
			</ul>
			<a href="/campaigns" class="text-ink-dim hover:text-ink hover:underline">
				Toutes les campagnes
			</a>
		{/if}
	{/if}
</main>
