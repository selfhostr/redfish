<script lang="ts">
	import { Button, EmptyState, LocalTime, Page, Panel } from '$lib/components/ui';
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

	const summary = $derived(
		`${data.total} entrée${data.total > 1 ? 's' : ''} · page ${data.page} sur ${data.pages}. Actions sensibles en lecture seule : connexions, comptes, clients, scénarios, envois.`
	);
</script>

<Page title="Journal d'audit" description={summary}>
	<form
		method="GET"
		role="search"
		aria-label="Filtrer le journal"
		class="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-end"
	>
		<label class="flex flex-col gap-1.5">
			<span class="rf-label">Action</span>
			<select class="rf-input md:w-48" name="action">
				<option value="">Toutes</option>
				{#each data.groups as g (g.value)}
					<option value={g.value} selected={data.filters.action === g.value}>{g.label}</option>
				{/each}
			</select>
		</label>
		<label class="flex flex-col gap-1.5">
			<span class="rf-label">Acteur (e-mail)</span>
			<input class="rf-input md:w-64" type="search" name="actor" value={data.filters.actor} />
		</label>
		<label class="flex flex-col gap-1.5">
			<span class="rf-label">Client</span>
			<select class="rf-input md:w-48" name="tenant">
				<option value="">Tous</option>
				{#each data.tenants as t (t.id)}
					<option value={t.id} selected={data.filters.tenantId === t.id}>{t.name}</option>
				{/each}
			</select>
		</label>
		<label class="flex flex-col gap-1.5">
			<span class="rf-label">Du (UTC)</span>
			<input class="rf-input" type="date" name="from" value={data.filters.from} />
		</label>
		<label class="flex flex-col gap-1.5">
			<span class="rf-label">Au (UTC)</span>
			<input class="rf-input" type="date" name="to" value={data.filters.to} />
		</label>
		<Button type="submit" variant="secondary" class="max-md:w-full">Filtrer</Button>
		<Button href="/audit" variant="ghost" class="max-md:w-full">Réinitialiser</Button>
	</form>

	{#if data.entries.length === 0}
		<EmptyState
			title="Aucune entrée"
			message="Aucune action ne correspond à ces filtres. Modifiez-les ou réinitialisez la recherche."
		/>
	{:else}
		<Panel flush>
			<div class="hidden md:block">
				<table class="w-full text-left">
					<thead class="border-b border-line">
						<tr>
							<th class="rf-label px-4 py-2.5">Date</th>
							<th class="rf-label px-4 py-2.5">Action</th>
							<th class="rf-label px-4 py-2.5">Acteur</th>
							<th class="rf-label px-4 py-2.5">Client</th>
							<th class="rf-label px-4 py-2.5">Détails</th>
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
									<span class="rf-meta block font-mono">{e.action}</span>
								</td>
								<td class="px-4 py-3 [overflow-wrap:anywhere] text-ink">{e.actor}</td>
								<td class="px-4 py-3 text-ink-dim">{e.tenant ?? '—'}</td>
								<td class="rf-meta px-4 py-3 font-mono [overflow-wrap:anywhere]">
									{#if e.target}<span class="block">{e.target}</span>{/if}
									{#if e.details}<span class="block">{e.details}</span>{/if}
									{#if !e.target && !e.details}—{/if}
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
			<ul class="divide-y divide-line md:hidden">
				{#each data.entries as e (e.id)}
					<li class="flex flex-col gap-1 px-4 py-3">
						<span class="text-ink">{e.label}</span>
						<span class="rf-meta font-mono [overflow-wrap:anywhere]">{e.action}</span>
						<span class="rf-meta [overflow-wrap:anywhere]">
							<LocalTime value={e.createdAt} /> · {e.actor} · {e.tenant ?? '—'}
						</span>
						{#if e.target || e.details}
							<span class="rf-meta font-mono [overflow-wrap:anywhere]">
								{[e.target, e.details].filter(Boolean).join(' · ')}
							</span>
						{/if}
					</li>
				{/each}
			</ul>
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
</Page>
