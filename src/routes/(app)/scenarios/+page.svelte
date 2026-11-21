<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import { Button, CopyButton, EmptyState, ErrorNotice, Panel, Plate } from '$lib/components/ui';
	import { categoryLabel, difficultyLabel, localeLabel } from '$lib/scenario-labels';
	import { withParams } from '$lib/url-params';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const isSuperadmin = $derived(data.user.role === 'superadmin');
	let importing = $state(false);
	let fileInput: HTMLInputElement | undefined = $state();

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
	<div class="flex flex-wrap items-center justify-between gap-3">
		<h1 class="text-2xl font-semibold text-ink">Scénarios</h1>
		{#if isSuperadmin}
			<div class="flex flex-wrap items-center gap-2">
				<Button href="/scenarios/new" variant="primary">Créer un scénario</Button>
				<form
					method="POST"
					action="?/import"
					enctype="multipart/form-data"
					use:enhance={() => {
						importing = true;
						return async ({ update }) => {
							await update();
							if (fileInput) fileInput.value = '';
							importing = false;
						};
					}}
				>
					<input
						bind:this={fileInput}
						id="import-file"
						class="sr-only"
						type="file"
						name="file"
						accept="application/json,.json"
						disabled={importing}
						onchange={(e) => e.currentTarget.form?.requestSubmit()}
					/>
					<label for="import-file" class="btn-import" aria-disabled={importing || undefined}>
						{importing ? 'Import en cours...' : 'Importer un scénario'}
					</label>
				</form>
			</div>
		{/if}
	</div>

	{#if form?.error}
		<ErrorNotice message={form.error} />
	{:else if form?.success}
		<p role="status" class="text-ink">
			Scénario importé : <span class="font-mono">{form.key}</span>
		</p>
	{/if}

	<p class="text-ink-dim">
		Vos scénarios, créés ou importés. La plateforme ne livre aucun scénario : vous fournissez les
		vôtres. Ouvrez un scénario pour en voir l'aperçu.
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
		<EmptyState
			title="Aucun scénario"
			message="La plateforme ne livre aucun scénario. Créez-en un ou importez un scénario existant pour commencer."
		>
			{#if isSuperadmin}
				<div class="flex flex-wrap items-center gap-2">
					<Button href="/scenarios/new" variant="primary" size="sm">Créer un scénario</Button>
					<label for="import-file" class="btn-import">Importer un scénario</label>
				</div>
			{/if}
		</EmptyState>
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
						<div>
							<Button
								href="/scenarios/{encodeURIComponent(s.key)}/export"
								download
								variant="secondary"
							>
								Exporter
							</Button>
						</div>
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
							<th class="rf-label px-4 py-3 font-medium">Export</th>
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
								<td class="px-4 py-3">
									<Button
										href="/scenarios/{encodeURIComponent(s.key)}/export"
										download
										variant="secondary"
									>
										Exporter
									</Button>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</Panel>
	{/if}
</main>

<style>
	.btn-import {
		display: inline-flex;
		align-items: center;
		min-height: 2.5rem;
		padding: 0 1rem;
		border: 1px solid var(--color-line);
		border-radius: 0.375rem;
		background: var(--color-surface-2);
		color: var(--color-ink);
		cursor: pointer;
	}
	.btn-import:hover {
		background: var(--color-surface-1);
	}
	.btn-import[aria-disabled='true'] {
		opacity: 0.6;
		cursor: not-allowed;
	}
	#import-file:focus-visible + .btn-import {
		outline: 2px solid var(--color-ink);
		outline-offset: 2px;
	}
</style>
