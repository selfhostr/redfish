<script lang="ts">
	import { page } from '$app/state';
	import { Button, CopyButton, EmptyState, Panel, Plate } from '$lib/components/ui';
	import { categoryLabel, difficultyLabel, localeLabel } from '$lib/scenario-labels';
	import { withParams } from '$lib/url-params';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const hasFilters = $derived(
		Boolean(
			data.filters.q || data.filters.category || data.filters.difficulty || data.filters.locale
		)
	);
	const resetHref = $derived(
		withParams(page.url, { q: null, category: null, difficulty: null, locale: null })
	);
</script>

<main class="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-6 md:px-6 md:py-8">
	<h1 class="text-2xl font-semibold text-ink">Scénarios</h1>

	<p class="text-ink-dim">
		Catalogue global des scénarios livrés avec la plateforme, en lecture seule. Ouvrez un scénario
		pour en voir l'aperçu.
	</p>

	<Panel>
		<form method="GET" class="flex flex-wrap items-end gap-3">
			<label class="flex w-full min-w-48 grow flex-col gap-1.5 md:w-auto">
				<span class="rf-label">Recherche</span>
				<input
					class="rf-input"
					type="search"
					name="q"
					value={data.filters.q ?? ''}
					placeholder="Titre, clé ou tag"
				/>
			</label>
			<label class="flex w-full flex-col gap-1.5 md:w-auto">
				<span class="rf-label">Catégorie</span>
				<select class="rf-input" name="category">
					<option value="">Toutes</option>
					{#each data.available.categories as c (c)}
						<option value={c} selected={data.filters.category === c}>{categoryLabel(c)}</option>
					{/each}
				</select>
			</label>
			<label class="flex w-full flex-col gap-1.5 md:w-auto">
				<span class="rf-label">Difficulté</span>
				<select class="rf-input" name="difficulty">
					<option value="">Toutes</option>
					{#each data.available.difficulties as d (d)}
						<option value={d} selected={data.filters.difficulty === d}>{difficultyLabel(d)}</option>
					{/each}
				</select>
			</label>
			<label class="flex w-full flex-col gap-1.5 md:w-auto">
				<span class="rf-label">Langue</span>
				<select class="rf-input" name="locale">
					<option value="">Toutes</option>
					{#each data.available.locales as l (l)}
						<option value={l} selected={data.filters.locale === l}>{localeLabel(l)}</option>
					{/each}
				</select>
			</label>
			<div class="flex w-full items-center gap-2 md:w-auto">
				<Button type="submit" variant="primary">Filtrer</Button>
				<Button href={resetHref} variant="ghost">Réinitialiser</Button>
			</div>
		</form>
	</Panel>

	<p class="text-ink-dim">{data.scenarios.length} sur {data.total}</p>

	{#if data.total === 0}
		<EmptyState title="Catalogue vide" message="Aucun scénario n'est chargé pour le moment." />
	{:else if data.scenarios.length === 0}
		<EmptyState title="Aucun résultat" message="Aucun scénario ne correspond à ces filtres.">
			{#if hasFilters}
				<Button href={resetHref} variant="secondary" size="sm">Réinitialiser</Button>
			{/if}
		</EmptyState>
	{:else}
		<Panel flush>
			<ul class="divide-y divide-line md:hidden">
				{#each data.scenarios as s (s.id)}
					<li class="flex flex-col gap-2 px-4 py-3">
						<div class="flex items-start justify-between gap-3">
							<a
								href="/scenarios/{encodeURIComponent(s.key)}"
								class="min-w-0 font-medium [overflow-wrap:anywhere] text-ink hover:underline"
							>
								{s.title}
							</a>
							{#if s.enabled}
								<Plate variant="signal">Activé</Plate>
							{:else}
								<Plate variant="neutral">Désactivé</Plate>
							{/if}
						</div>
						<span class="flex items-center gap-2">
							<span class="font-mono text-xs [overflow-wrap:anywhere] text-ink-dim">{s.key}</span>
							<CopyButton value={s.key} what="la clé" size="sm" />
						</span>
						<p class="text-xs text-ink-dim">
							{categoryLabel(s.category)} · {difficultyLabel(s.difficulty)} · {localeLabel(
								s.locale
							)}
						</p>
						{#if s.tags.length > 0}
							<p class="text-xs [overflow-wrap:anywhere] text-ink-dim">{s.tags.join(', ')}</p>
						{/if}
					</li>
				{/each}
			</ul>
			<div class="hidden overflow-x-auto md:block">
				<table class="w-full text-left">
					<thead class="bg-surface-2">
						<tr>
							<th class="rf-label px-4 py-3 font-medium">Titre</th>
							<th class="rf-label px-4 py-3 font-medium">Clé</th>
							<th class="rf-label px-4 py-3 font-medium">Catégorie</th>
							<th class="rf-label px-4 py-3 font-medium">Difficulté</th>
							<th class="rf-label px-4 py-3 font-medium">Langue</th>
							<th class="rf-label px-4 py-3 font-medium">Tags</th>
							<th class="rf-label px-4 py-3 font-medium">État</th>
						</tr>
					</thead>
					<tbody class="divide-y divide-line">
						{#each data.scenarios as s (s.id)}
							<tr class="hover:bg-surface-2">
								<td class="px-4 py-3">
									<a
										href="/scenarios/{encodeURIComponent(s.key)}"
										class="font-medium text-ink hover:underline"
									>
										{s.title}
									</a>
								</td>
								<td class="px-4 py-3">
									<span class="flex items-center gap-2">
										<span class="font-mono whitespace-nowrap text-ink-dim">{s.key}</span>
										<CopyButton value={s.key} what="la clé" size="sm" />
									</span>
								</td>
								<td class="px-4 py-3 text-ink-dim">{categoryLabel(s.category)}</td>
								<td class="px-4 py-3 text-ink-dim">{difficultyLabel(s.difficulty)}</td>
								<td class="px-4 py-3 text-ink-dim">{localeLabel(s.locale)}</td>
								<td class="px-4 py-3 text-ink-dim">
									{s.tags.length > 0 ? s.tags.join(', ') : 'n/d'}
								</td>
								<td class="px-4 py-3">
									{#if s.enabled}
										<Plate variant="signal">Activé</Plate>
									{:else}
										<Plate variant="neutral">Désactivé</Plate>
									{/if}
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</Panel>
	{/if}
</main>
