<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import { localNext } from '$lib/return-path';
	import ClientHeader from '$lib/components/ClientHeader.svelte';
	import {
		Button,
		CopyButton,
		EmptyState,
		ErrorNotice,
		Field,
		Panel,
		Plate
	} from '$lib/components/ui';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const next = $derived(localNext(page.url.searchParams.get('next')));

	let editing = $state<string | null>(null);

	const fields: [string, string, string][] = [
		['email', 'E-mail', 'email'],
		['firstName', 'Prénom', 'text'],
		['lastName', 'Nom', 'text'],
		['department', 'Service', 'text'],
		['locale', 'Langue', 'text']
	];
</script>

{#snippet actions(t: PageData['targets'][number])}
	{#if editing === t.id}
		<form
			method="POST"
			action="?/update"
			use:enhance={() =>
				async ({ update }) => {
					await update();
					editing = null;
				}}
			class="flex flex-col gap-2"
		>
			<input type="hidden" name="id" value={t.id} />
			<input
				name="email"
				type="email"
				required
				value={t.email}
				aria-label="E-mail"
				class="rf-input"
			/>
			<input name="firstName" value={t.firstName} aria-label="Prénom" class="rf-input" />
			<input name="lastName" value={t.lastName} aria-label="Nom" class="rf-input" />
			<input name="department" value={t.department ?? ''} aria-label="Service" class="rf-input" />
			<input name="locale" value={t.locale ?? ''} aria-label="Langue" class="rf-input" />
			<span class="flex gap-2">
				<Button type="submit" variant="primary" size="sm">Enregistrer</Button>
				<Button type="button" variant="ghost" size="sm" onclick={() => (editing = null)}>
					Annuler
				</Button>
			</span>
		</form>
	{:else if t.anonymizedAt}
		<span class="text-xs text-ink-dim">Anonymisée</span>
	{:else}
		<span class="flex flex-wrap gap-2">
			<Button type="button" variant="ghost" size="sm" onclick={() => (editing = t.id)}>
				Modifier
			</Button>
			{#if t.used}
				<form
					method="POST"
					action="?/anonymize"
					use:enhance
					onsubmit={(e) => {
						if (
							!confirm(
								'Anonymiser définitivement cette personne ? Les statistiques sont conservées.'
							)
						)
							e.preventDefault();
					}}
				>
					<input type="hidden" name="id" value={t.id} />
					<Button type="submit" variant="ghost" size="sm">Anonymiser</Button>
				</form>
			{:else}
				<form
					method="POST"
					action="?/delete"
					use:enhance
					onsubmit={(e) => {
						if (!confirm('Supprimer définitivement ce destinataire ?')) e.preventDefault();
					}}
				>
					<input type="hidden" name="id" value={t.id} />
					<Button type="submit" variant="ghost" size="sm">Supprimer</Button>
				</form>
			{/if}
		</span>
	{/if}
{/snippet}

<main class="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-6 md:px-6 md:py-8">
	<ClientHeader />
	<div class="flex flex-wrap items-center justify-between gap-3">
		<h2 class="text-lg font-semibold tracking-tight [overflow-wrap:anywhere] text-ink">
			{data.list.name}
		</h2>
		<Button href="/lists" variant="ghost" size="sm">Toutes les listes</Button>
	</div>

	{#if next}
		<div
			class="flex flex-col gap-3 rounded-lg border border-line-strong bg-surface-1 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
		>
			<p class="text-ink-dim">
				{data.targets.length === 0
					? 'Importez des destinataires, puis poursuivez la création de la campagne.'
					: `${data.targets.length} destinataire(s) dans cette liste. Vous pouvez poursuivre la création de la campagne.`}
			</p>
			<Button href={next} variant="primary" class="w-full sm:w-auto">
				Continuer vers la campagne
			</Button>
		</div>
	{/if}

	<p class="text-ink-dim">
		Les destinataires de cette liste reçoivent les campagnes qui l'utilisent. Importez un CSV ou
		ajoutez des personnes une par une.
	</p>

	{#if form?.error}
		<ErrorNotice message={form.error} />
	{/if}
	{#if form?.result}
		<div
			class="rounded-lg border border-line-strong border-l-signal bg-signal-bg px-4 py-3 text-ink"
			role="status"
		>
			<Plate variant="signal" class="mb-2">Import terminé</Plate>
			<p>{form.result.imported} importé(s), {form.result.skipped} ignoré(s).</p>
			{#if form.result.errors.length > 0}
				<ul class="mt-1 list-disc pl-5 text-ink-dim">
					{#each form.result.errors as e (e)}<li>{e}</li>{/each}
				</ul>
			{/if}
		</div>
	{/if}

	<Panel flush>
		{#snippet header()}
			<h2 class="rf-label">Destinataires</h2>
		{/snippet}
		{#if data.targets.length === 0}
			<EmptyState
				title="Aucun destinataire"
				message="Importez un CSV ou ajoutez un destinataire ci-dessous."
			/>
		{:else}
			<ul class="divide-y divide-line md:hidden">
				{#each data.targets as t (t.id)}
					<li class="flex flex-col gap-1 px-4 py-3">
						<span class="flex items-center justify-between gap-2">
							<span class="min-w-0 font-mono [overflow-wrap:anywhere] text-ink">{t.email}</span>
							<CopyButton value={t.email} what="l'e-mail" size="sm" />
						</span>
						<span class="text-xs text-ink-dim">
							{t.firstName}
							{t.lastName} · {t.department ?? 'n/d'} · {t.locale ?? 'n/d'}
						</span>
						{@render actions(t)}
					</li>
				{/each}
			</ul>
			<div class="hidden overflow-x-auto md:block">
				<table class="w-full text-left">
					<thead class="bg-surface-2">
						<tr>
							<th class="rf-label px-4 py-3 font-medium">E-mail</th>
							<th class="rf-label px-4 py-3 font-medium">Prénom</th>
							<th class="rf-label px-4 py-3 font-medium">Nom</th>
							<th class="rf-label px-4 py-3 font-medium">Service</th>
							<th class="rf-label px-4 py-3 font-medium">Langue</th>
							<th class="rf-label px-4 py-3 font-medium">Actions</th>
						</tr>
					</thead>
					<tbody class="divide-y divide-line">
						{#each data.targets as t (t.id)}
							<tr class="hover:bg-surface-2">
								<td class="px-4 py-3 text-ink">
									<span class="flex items-center gap-2">
										<span class="font-mono">{t.email}</span>
										<CopyButton value={t.email} what="l'e-mail" size="sm" />
									</span>
								</td>
								<td class="px-4 py-3 text-ink-dim">{t.firstName}</td>
								<td class="px-4 py-3 text-ink-dim">{t.lastName}</td>
								<td class="px-4 py-3 text-ink-dim">{t.department ?? 'n/d'}</td>
								<td class="px-4 py-3 text-ink-dim">{t.locale ?? 'n/d'}</td>
								<td class="px-4 py-3">{@render actions(t)}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	</Panel>

	<div class="grid gap-6 md:grid-cols-2">
		<Panel>
			{#snippet header()}
				<h2 class="rf-label">Import CSV</h2>
			{/snippet}
			<div class="flex flex-col gap-3">
				<p class="text-ink-dim">
					Colonnes : email (requis), firstName, lastName, department, locale.
				</p>
				<form
					method="POST"
					action="?/import"
					enctype="multipart/form-data"
					use:enhance
					class="flex flex-col gap-3"
				>
					<Field label="Fichier CSV" id="csv-file">
						{#snippet input()}
							<input
								id="csv-file"
								type="file"
								name="csv"
								accept=".csv,text/csv"
								required
								class="rf-input w-full"
							/>
						{/snippet}
					</Field>
					<Button type="submit" variant="primary" class="w-full md:w-auto md:self-start">
						Importer
					</Button>
				</form>
			</div>
		</Panel>

		<Panel>
			{#snippet header()}
				<h2 class="rf-label">Ajout manuel</h2>
			{/snippet}
			<form method="POST" action="?/add" use:enhance class="flex flex-col gap-3">
				<p class="text-ink-dim">Seul l'e-mail est obligatoire.</p>
				{#each fields as [name, label, type] (name)}
					<Field {label} {name} {type} required={name === 'email'} />
				{/each}
				<Button type="submit" variant="primary" class="w-full md:w-auto md:self-start">
					Ajouter
				</Button>
			</form>
		</Panel>
	</div>
</main>
