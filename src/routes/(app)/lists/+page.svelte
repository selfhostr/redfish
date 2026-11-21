<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import ClientHeader from '$lib/components/ClientHeader.svelte';
	import { localNext } from '$lib/return-path';
	import { Button, EmptyState, ErrorNotice, Field, Panel } from '$lib/components/ui';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
	const next = $derived(localNext(page.url.searchParams.get('next')));
</script>

<main class="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-6 md:px-6 md:py-8">
	<ClientHeader />
	<h2 class="text-lg font-semibold tracking-tight text-ink">Listes de destinataires</h2>

	<p class="text-ink-dim">
		Chaque liste regroupe les personnes ciblées par vos campagnes. Ouvrez une liste pour consulter
		ou importer ses destinataires.
	</p>

	<Panel flush>
		{#snippet header()}
			<h2 class="rf-label">Listes</h2>
		{/snippet}
		{#if data.lists.length === 0}
			<EmptyState
				title="Aucune liste"
				message="Créez la première liste ci-dessous, puis importez des destinataires."
			/>
		{:else}
			<ul class="divide-y divide-line">
				{#each data.lists as l (l.id)}
					<li class="px-4 py-3">
						<a
							href="/lists/{l.id}"
							class="font-medium [overflow-wrap:anywhere] text-ink hover:underline"
						>
							{l.name}
						</a>
					</li>
				{/each}
			</ul>
		{/if}
	</Panel>

	<Panel>
		{#snippet header()}
			<h2 class="rf-label">Nouvelle liste</h2>
		{/snippet}
		<div class="flex flex-col gap-4">
			<p class="text-ink-dim">
				Donnez un nom à la liste ; vous ajouterez les destinataires ensuite.
			</p>
			<form method="POST" use:enhance class="flex flex-col gap-3 sm:flex-row sm:items-end">
				<Field
					class="grow"
					label="Nom de la liste"
					name="name"
					required
					placeholder="Ex. Direction financière"
				/>
				<Button type="submit" variant="primary" class="w-full sm:w-auto">Créer</Button>
			</form>
			{#if form?.error}
				<ErrorNotice message={form.error} />
			{/if}
			{#if form?.success && next}
				<Button href={next} variant="primary" class="w-full sm:w-auto sm:self-start">
					Continuer la campagne
				</Button>
			{/if}
		</div>
	</Panel>
</main>
