<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button, EmptyState, ErrorNotice, Field, Panel } from '$lib/components/ui';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

<main class="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-6 md:px-6 md:py-8">
	<div class="flex flex-wrap items-center justify-between gap-3">
		<h1 class="text-2xl font-semibold tracking-tight text-ink">Données personnelles (RGPD)</h1>
		<Button href="/lists" variant="ghost" size="sm" class="max-sm:w-full">
			Retour aux destinataires
		</Button>
	</div>
	<p class="text-ink-dim">
		Recherchez une personne par e-mail dans toutes les listes de ce client, exportez ses données
		(demande d'accès) ou effacez-les. Les cibles déjà utilisées en campagne sont anonymisées, les
		autres supprimées ; les statistiques agrégées sont conservées.
	</p>

	{#if form?.error}<ErrorNotice message={form.error} />{/if}
	{#if data.error}<ErrorNotice message={data.error} />{/if}
	{#if form?.erased}
		<div class="rounded-lg border border-line-strong bg-signal-bg px-4 py-3 text-ink" role="status">
			{form.erased.anonymized} cible(s) anonymisée(s), {form.erased.deleted} supprimée(s).
		</div>
	{/if}

	<Panel>
		{#snippet header()}
			<h2 class="rf-label">Rechercher</h2>
		{/snippet}
		<form method="GET" class="flex flex-col gap-3">
			<Field label="E-mail" name="email" type="email" required value={data.email} />
			<Button type="submit" variant="primary" class="w-full md:w-auto md:self-start">
				Rechercher
			</Button>
		</form>
	</Panel>

	{#if data.matches}
		<Panel flush>
			{#snippet header()}
				<h2 class="rf-label">Résultats</h2>
			{/snippet}
			{#if data.matches.length === 0}
				<EmptyState title="Aucune donnée" message="Aucune cible avec cet e-mail dans ce client." />
			{:else}
				<ul class="divide-y divide-line">
					{#each data.matches as m (m.id)}
						<li class="px-4 py-3 text-ink">
							{m.firstName}
							{m.lastName} · {m.department ?? 'n/d'} ·
							<a class="underline" href="/lists/{m.listId}">{m.listName}</a>
						</li>
					{/each}
				</ul>
				<div class="flex flex-wrap gap-3 border-t border-line px-4 py-3">
					<form method="POST" action="/privacy/export">
						<input type="hidden" name="email" value={data.email} />
						<Button type="submit" variant="secondary">Exporter (JSON)</Button>
					</form>
					<form
						method="POST"
						action="?/erase"
						use:enhance
						onsubmit={(e) => {
							if (!confirm('Effacer définitivement les données de cette personne dans ce client ?'))
								e.preventDefault();
						}}
					>
						<input type="hidden" name="email" value={data.email} />
						<Button type="submit" variant="danger">Anonymiser / effacer</Button>
					</form>
				</div>
			{/if}
		</Panel>
	{/if}
</main>
