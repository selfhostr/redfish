<script lang="ts">
	import { page } from '$app/state';
	import StatusPill from '$lib/components/StatusPill.svelte';
	import { Button, EmptyState, LocalTime, Page, Panel } from '$lib/components/ui';
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
	const summary = $derived(
		data.total === 0
			? 'Aucune campagne pour ce client.'
			: `${data.total} campagne${data.total > 1 ? 's' : ''} pour ce client. Ouvrez-en une pour suivre son envoi et ses résultats.`
	);
</script>

<Page title="Campagnes" description={summary}>
	{#snippet actions()}
		<Button variant="primary" href="/campaigns/new" class="max-md:w-full">Nouvelle campagne</Button>
	{/snippet}

	{#if data.total === 0}
		<EmptyState
			title="Aucune campagne"
			message="Créez votre première campagne de sensibilisation pour ce client."
		>
			<Button variant="primary" href="/campaigns/new">Créer une campagne</Button>
		</EmptyState>
	{:else}
		<form
			method="GET"
			role="search"
			aria-label="Filtrer les campagnes"
			class="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-end"
		>
			<div class="flex flex-col gap-1.5">
				<label class="rf-label" for="f-q">Nom</label>
				<input
					id="f-q"
					name="q"
					type="search"
					class="rf-input md:w-72"
					value={data.filters.q}
					placeholder="Rechercher par nom"
				/>
			</div>
			<div class="flex flex-col gap-1.5">
				<label class="rf-label" for="f-status">Statut</label>
				<select id="f-status" name="status" class="rf-input md:w-44">
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
							class="flex flex-col gap-2 rounded-card border border-line bg-surface-1 px-4 py-3 active:bg-surface-2"
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
						<table class="w-full text-left">
							<thead class="border-b border-line">
								<tr>
									<th class="rf-label px-4 py-2.5">Nom</th>
									<th class="rf-label px-4 py-2.5">Statut</th>
									<th class="rf-label px-4 py-2.5">Programmée</th>
									<th class="rf-label px-4 py-2.5">Créée le</th>
								</tr>
							</thead>
							<tbody class="divide-y divide-line">
								{#each data.campaigns as c (c.id)}
									<tr class="rf-row">
										<td class="px-4 py-3">
											<a href={`/campaigns/${c.id}`} class="rf-row-link font-medium text-ink">
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
</Page>
