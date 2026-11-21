<script lang="ts">
	import { Button, EmptyState, LocalTime, Panel } from '$lib/components/ui';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	/** Lien vers une autre page en conservant les filtres courants. */
	function pageHref(p: number): string {
		const params = new URLSearchParams();
		const f = data.filters;
		if (f.action) params.set('action', f.action);
		if (f.actor) params.set('actor', f.actor);
		if (f.tenantId) params.set('tenant', f.tenantId);
		if (f.from) params.set('from', f.from);
		if (f.to) params.set('to', f.to);
		params.set('page', String(p));
		return `?${params.toString()}`;
	}
</script>

<main class="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-6 md:px-6 md:py-8">
	<div>
		<h1 class="text-lg font-semibold tracking-tight text-ink">Journal d'audit</h1>
		<p class="text-ink-dim">
			Actions sensibles : connexions, sécurité des comptes, clients, scénarios, profils d'envoi,
			campagnes et cibles. Lecture seule.
		</p>
	</div>

	<Panel>
		<form method="GET" class="flex flex-wrap items-end gap-3">
			<label class="flex w-full flex-col gap-1.5 md:w-auto">
				<span class="rf-label">Action</span>
				<select class="rf-input" name="action">
					<option value="">Toutes</option>
					{#each data.groups as g (g.value)}
						<option value={g.value} selected={data.filters.action === g.value}>{g.label}</option>
					{/each}
				</select>
			</label>
			<label class="flex w-full min-w-48 grow flex-col gap-1.5 md:w-auto">
				<span class="rf-label">Acteur (e-mail)</span>
				<input class="rf-input" type="search" name="actor" value={data.filters.actor} />
			</label>
			<label class="flex w-full flex-col gap-1.5 md:w-auto">
				<span class="rf-label">Client</span>
				<select class="rf-input" name="tenant">
					<option value="">Tous</option>
					{#each data.tenants as t (t.id)}
						<option value={t.id} selected={data.filters.tenantId === t.id}>{t.name}</option>
					{/each}
				</select>
			</label>
			<label class="flex w-full flex-col gap-1.5 md:w-auto">
				<span class="rf-label">Du (UTC)</span>
				<input class="rf-input" type="date" name="from" value={data.filters.from} />
			</label>
			<label class="flex w-full flex-col gap-1.5 md:w-auto">
				<span class="rf-label">Au (UTC)</span>
				<input class="rf-input" type="date" name="to" value={data.filters.to} />
			</label>
			<div class="flex w-full items-center gap-2 md:w-auto">
				<Button type="submit" variant="primary">Filtrer</Button>
				<Button href="/audit" variant="ghost">Réinitialiser</Button>
			</div>
		</form>
	</Panel>

	<p class="text-ink-dim">{data.total} entrée(s) · page {data.page} sur {data.pages}</p>

	{#if data.entries.length === 0}
		<EmptyState title="Aucune entrée" message="Aucune action ne correspond à ces filtres." />
	{:else}
		<Panel flush>
			<div class="overflow-x-auto">
				<table class="w-full text-left">
					<thead class="bg-surface-2">
						<tr>
							<th class="rf-label px-4 py-3 font-medium">Date</th>
							<th class="rf-label px-4 py-3 font-medium">Action</th>
							<th class="rf-label px-4 py-3 font-medium">Acteur</th>
							<th class="rf-label px-4 py-3 font-medium">Client</th>
							<th class="rf-label px-4 py-3 font-medium">Détails</th>
						</tr>
					</thead>
					<tbody class="divide-y divide-line">
						{#each data.entries as e (e.id)}
							<tr>
								<td class="px-4 py-3 whitespace-nowrap text-ink-dim">
									<LocalTime value={e.createdAt} />
								</td>
								<td class="px-4 py-3">
									<span class="text-ink">{e.label}</span>
									<span class="block font-mono text-xs text-ink-dim">{e.action}</span>
								</td>
								<td class="px-4 py-3 [overflow-wrap:anywhere] text-ink">{e.actor}</td>
								<td class="px-4 py-3 text-ink-dim">{e.tenant ?? '—'}</td>
								<td class="px-4 py-3 font-mono text-xs [overflow-wrap:anywhere] text-ink-dim">
									{#if e.target}<span class="block">{e.target}</span>{/if}
									{#if e.details}<span class="block">{e.details}</span>{/if}
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</Panel>
		{#if data.pages > 1}
			<nav class="flex items-center gap-2" aria-label="Pagination">
				{#if data.page > 1}
					<Button href={pageHref(data.page - 1)} size="sm">Précédente</Button>
				{/if}
				{#if data.page < data.pages}
					<Button href={pageHref(data.page + 1)} size="sm">Suivante</Button>
				{/if}
			</nav>
		{/if}
	{/if}
</main>
