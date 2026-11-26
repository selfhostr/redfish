<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import { localNext } from '$lib/return-path';
	import { EMAIL_NAME_WARNING, looksLikeEmail } from '$lib/email-name';
	import {
		Button,
		CopyButton,
		EmptyState,
		ErrorNotice,
		Field,
		Page,
		Panel,
		Plate
	} from '$lib/components/ui';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const next = $derived(localNext(page.url.searchParams.get('next')));

	let editing = $state<string | null>(null);
	let renaming = $state(false);
	let confirmingDelete = $state(false);
	let draftName = $state('');

	const fields: [string, string, string][] = [
		['email', 'E-mail', 'email'],
		['firstName', 'Prénom', 'text'],
		['lastName', 'Nom', 'text'],
		['department', 'Service', 'text'],
		['locale', 'Langue', 'text']
	];
</script>

{#snippet targetActions(t: PageData['targets'][number])}
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
		<span class="rf-meta">Anonymisée</span>
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

<Page
	title={data.list.name}
	description={`${data.targets.length} destinataire${data.targets.length > 1 ? 's' : ''} dans cette liste. Ils reçoivent les campagnes qui l'utilisent.`}
>
	{#snippet meta()}
		{#if data.list.archivedAt}<Plate variant="neutral">Archivée</Plate>{/if}
	{/snippet}
	{#snippet actions()}
		<div class="flex flex-wrap gap-2 max-md:w-full">
			<Button href="/lists" variant="ghost" size="sm">Toutes les listes</Button>
			<Button
				variant="secondary"
				size="sm"
				onclick={() => {
					draftName = data.list.name;
					renaming = true;
				}}
			>
				Renommer
			</Button>
			{#if !data.list.archivedAt}
				<Button variant="ghost" size="sm" onclick={() => (confirmingDelete = true)}>
					Supprimer la liste
				</Button>
			{/if}
		</div>
	{/snippet}

	{#if renaming}
		<Panel>
			<form
				method="POST"
				action="?/rename"
				class="flex flex-col gap-3 md:flex-row md:items-end"
				use:enhance={() =>
					async ({ update }) => {
						await update({ reset: false });
						renaming = false;
					}}
			>
				<Field
					class="grow md:max-w-md"
					label="Nom de la liste"
					name="name"
					required
					bind:value={draftName}
					placeholder="ex. Comptabilité, Direction…"
				/>
				<div class="flex gap-2">
					<Button type="submit" variant="primary">Enregistrer</Button>
					<Button type="button" variant="ghost" onclick={() => (renaming = false)}>Annuler</Button>
				</div>
			</form>
		</Panel>
	{/if}

	{#if renaming && looksLikeEmail(draftName)}
		<p class="text-ink-dim" role="status">{EMAIL_NAME_WARNING}</p>
	{/if}

	{#if data.list.archivedAt}
		<Panel>
			<form method="POST" action="?/restoreList" use:enhance class="flex flex-col gap-3">
				<p class="text-ink">
					Cette liste est archivée : elle n'apparaît plus dans les choix de campagne.
				</p>
				<Button type="submit" variant="secondary" class="sm:self-start">Restaurer la liste</Button>
			</form>
		</Panel>
	{/if}

	{#if confirmingDelete}
		<Panel>
			<form method="POST" action="?/deleteList" use:enhance class="flex flex-col gap-3">
				<p class="text-ink">
					{#if data.usage > 0}
						Cette liste est utilisée par {data.usage}
						{data.usage > 1 ? 'campagnes' : 'campagne'} : elle sera archivée (masquée de la page Destinataires
						et du choix pour les nouvelles campagnes) mais restera visible dans les campagnes et rapports
						existants.
					{:else}
						Supprimer définitivement cette liste et tous ses destinataires ? Elle n'est utilisée par
						aucune campagne. Cette action est irréversible.
					{/if}
				</p>
				<div class="flex gap-3 max-md:flex-col">
					<Button type="submit" variant="danger" class="max-md:w-full">
						{data.usage > 0 ? 'Archiver' : 'Supprimer définitivement'}
					</Button>
					<Button variant="ghost" class="max-md:w-full" onclick={() => (confirmingDelete = false)}>
						Annuler
					</Button>
				</div>
			</form>
		</Panel>
	{/if}

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

	<div class="grid gap-4 lg:grid-cols-2">
		<Panel>
			{#snippet header()}
				<h2 class="rf-title">Import CSV</h2>
			{/snippet}
			<div class="flex flex-col gap-3">
				<p class="rf-meta">Colonnes : email (requis), firstName, lastName, department, locale.</p>
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
				<h2 class="rf-title">Ajout manuel</h2>
			{/snippet}
			<form method="POST" action="?/add" use:enhance class="flex flex-col gap-3">
				<p class="rf-meta">Seul l'e-mail est obligatoire.</p>
				{#each fields as [name, label, type] (name)}
					<Field {label} {name} {type} required={name === 'email'} />
				{/each}
				<Button type="submit" variant="primary" class="w-full md:w-auto md:self-start">
					Ajouter
				</Button>
			</form>
		</Panel>
	</div>

	<Panel flush>
		{#snippet header()}
			<h2 class="rf-title">Destinataires</h2>
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
						<span class="rf-meta">
							{t.firstName}
							{t.lastName} · {t.department ?? '—'} · {t.locale ?? '—'}
						</span>
						{@render targetActions(t)}
					</li>
				{/each}
			</ul>
			<div class="hidden overflow-x-auto md:block">
				<table class="w-full text-left">
					<thead class="border-b border-line">
						<tr>
							<th class="rf-label px-4 py-2.5">E-mail</th>
							<th class="rf-label px-4 py-2.5">Prénom</th>
							<th class="rf-label px-4 py-2.5">Nom</th>
							<th class="rf-label px-4 py-2.5">Service</th>
							<th class="rf-label px-4 py-2.5">Langue</th>
							<th class="rf-label px-4 py-2.5">Actions</th>
						</tr>
					</thead>
					<tbody class="divide-y divide-line">
						{#each data.targets as t (t.id)}
							<tr class="rf-row">
								<td class="px-4 py-3 text-ink">
									<span class="flex items-center gap-2">
										<span class="font-mono">{t.email}</span>
										<CopyButton value={t.email} what="l'e-mail" size="sm" />
									</span>
								</td>
								<td class="px-4 py-3 text-ink-dim">{t.firstName}</td>
								<td class="px-4 py-3 text-ink-dim">{t.lastName}</td>
								<td class="px-4 py-3 text-ink-dim">{t.department ?? '—'}</td>
								<td class="px-4 py-3 text-ink-dim">{t.locale ?? '—'}</td>
								<td class="px-4 py-3">{@render targetActions(t)}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	</Panel>
</Page>
