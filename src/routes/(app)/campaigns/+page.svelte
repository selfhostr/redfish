<script lang="ts">
	import { page } from '$app/state';
	import StatusPill from '$lib/components/StatusPill.svelte';
	import { Button, EmptyState, LocalTime, Panel } from '$lib/components/ui';
	import { withParams } from '$lib/url-params';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const statuses = [
		{ value: '', label: 'Tous' },
		{ value: 'draft', label: 'Brouillon' },
		{ value: 'scheduled', label: 'Programmée' },
		{ value: 'sending', label: 'En cours' },
		{ value: 'completed', label: 'Terminée' }
	];
	const filtered = $derived(data.filters.status !== '' || data.filters.q !== '');
</script>

<main class="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-6 md:px-6 md:py-8">
	<div class="flex flex-wrap items-center justify-between gap-3">
		<h1 class="text-2xl font-semibold tracking-tight text-ink">Campagnes</h1>
		<Button variant="primary" href="/campaigns/new" class="max-md:w-full">Nouvelle campagne</Button>
	</div>

	{#if data.total === 0}
		<EmptyState
			title="Aucune campagne"
			message="Créez votre première campagne de sensibilisation pour ce client."
		>
			<Button variant="primary" href="/campaigns/new">Créer une campagne</Button>
		</EmptyState>
	{:else}
		<p class="text-ink-dim">
			Filtrez les campagnes de ce client par statut ou par nom. Les filtres sont conservés dans
			l'adresse de la page.
		</p>
		<form method="GET" class="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-end">
			<div class="flex flex-col gap-1.5">
				<label class="rf-label" for="f-q">Nom</label>
				<input
					id="f-q"
					name="q"
					type="search"
					class="rf-input max-md:w-full"
					value={data.filters.q}
					placeholder="Rechercher par nom"
				/>
			</div>
			<div class="flex flex-col gap-1.5">
				<label class="rf-label" for="f-status">Statut</label>
				<select id="f-status" name="status" class="rf-input max-md:w-full">
					{#each statuses as s (s.value)}
						<option value={s.value} selected={s.value === data.filters.status}>{s.label}</option>
					{/each}
				</select>
			</div>
			<Button type="submit" variant="secondary" class="max-md:w-full">Filtrer</Button>
			{#if filtered}
				<Button
					variant="ghost"
					href={withParams(page.url, { q: null, status: null })}
					class="max-md:w-full"
				>
					Réinitialiser
				</Button>
			{/if}
		</form>

		{#if data.campaigns.length === 0}
			<EmptyState
				title="Aucun résultat"
				message="Aucune campagne ne correspond à ces filtres. Modifiez-les ou réinitialisez la recherche."
			>
				<Button variant="secondary" href={withParams(page.url, { q: null, status: null })}>
					Réinitialiser
				</Button>
			</EmptyState>
		{:else}
			<ul class="flex flex-col gap-3 md:hidden">
				{#each data.campaigns as c (c.id)}
					<li>
						<a
							href={`/campaigns/${c.id}`}
							class="flex flex-col gap-2 rounded-md border border-line bg-surface px-4 py-3 active:bg-surface-2"
						>
							<span class="flex items-start justify-between gap-3">
								<span class="min-w-0 font-medium break-words text-ink">{c.name}</span>
								<span class="shrink-0"><StatusPill status={c.status} /></span>
							</span>
							<span class="flex flex-col gap-0.5 text-ink-dim">
								{#if c.scheduledAt}
									<span>
										Programmée : <LocalTime value={c.scheduledAt} timeZone={data.timezone} />
									</span>
								{/if}
								<span>Créée le <LocalTime value={c.createdAt} timeZone={data.timezone} /></span>
							</span>
						</a>
					</li>
				{/each}
			</ul>
			<div class="max-md:hidden">
				<Panel flush>
					<div class="overflow-x-auto">
						<table class="w-full text-left text-sm">
							<thead class="border-b border-line bg-surface-2">
								<tr>
									<th class="rf-label px-4 py-3 font-medium">Nom</th>
									<th class="rf-label px-4 py-3 font-medium">Statut</th>
									<th class="rf-label px-4 py-3 font-medium">Programmée</th>
									<th class="rf-label px-4 py-3 font-medium">Créée le</th>
								</tr>
							</thead>
							<tbody class="divide-y divide-line">
								{#each data.campaigns as c (c.id)}
									<tr class="hover:bg-surface-2">
										<td class="px-4 py-3">
											<a href={`/campaigns/${c.id}`} class="font-medium text-ink hover:underline">
												{c.name}
											</a>
										</td>
										<td class="px-4 py-3"><StatusPill status={c.status} /></td>
										<td class="px-4 py-3 text-ink-dim">
											<LocalTime value={c.scheduledAt} timeZone={data.timezone} />
										</td>
										<td class="px-4 py-3 text-ink-dim">
											<LocalTime value={c.createdAt} timeZone={data.timezone} />
										</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				</Panel>
			</div>
		{/if}
	{/if}
</main>
