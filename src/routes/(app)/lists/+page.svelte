<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import { localNext } from '$lib/return-path';
	import { EMAIL_NAME_WARNING, looksLikeEmail } from '$lib/email-name';
	import { withParams } from '$lib/url-params';
	import { Button, EmptyState, ErrorNotice, Field, Page, Panel, Plate } from '$lib/components/ui';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
	const next = $derived(localNext(page.url.searchParams.get('next')));
	// A named action replaces the query string, so ?next= is carried over explicitly.
	const createAction = $derived(`?/create${next ? `&next=${encodeURIComponent(next)}` : ''}`);
	let pendingId: string | null = $state(null);
	let newName = $state('');
	const pending = $derived(data.lists.find((l) => l.id === pendingId));
	const pendingUsage = $derived(pending ? (data.usage[pending.id] ?? 0) : 0);
	const archivedHref = $derived(withParams(page.url, { archived: data.showArchived ? null : '1' }));
</script>

{#snippet rowActions(l: PageData['lists'][number])}
	{#if l.archived}
		<form method="POST" action="?/restore" use:enhance>
			<input type="hidden" name="id" value={l.id} />
			<Button type="submit" variant="secondary" size="sm">Restaurer</Button>
		</form>
	{:else}
		<Button variant="ghost" size="sm" onclick={() => (pendingId = l.id)}>Supprimer</Button>
	{/if}
{/snippet}

<Page
	title="Destinataires"
	description={data.lists.length === 0
		? 'Aucune liste pour ce client.'
		: `${data.lists.length} liste${data.lists.length > 1 ? 's' : ''}${data.showArchived ? ' (archivées comprises)' : ''}. Ouvrez une liste pour consulter ou importer ses destinataires.`}
>
	<Panel>
		{#snippet header()}
			<h2 class="rf-title">Nouvelle liste</h2>
		{/snippet}
		<div class="flex flex-col gap-3">
			<form
				method="POST"
				action={createAction}
				use:enhance
				class="flex flex-col gap-3 md:flex-row md:items-end"
			>
				<Field
					class="grow md:max-w-md"
					label="Nom de la liste"
					name="name"
					required
					bind:value={newName}
					placeholder="ex. Comptabilité, Direction…"
				/>
				<Button type="submit" variant="primary" class="max-md:w-full">Créer</Button>
			</form>
			<p class="rf-meta">
				Donnez le nom du service ou du groupe visé. Les adresses e-mail s'ajoutent ensuite, dans la
				liste.
			</p>
			{#if looksLikeEmail(newName) || (form && 'warning' in form && form.warning)}
				<p class="text-ink-dim" role="status">{EMAIL_NAME_WARNING}</p>
			{/if}
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

	{#if pending}
		<Panel>
			<form
				method="POST"
				action="?/delete"
				class="flex flex-col gap-3"
				use:enhance={() =>
					async ({ update }) => {
						await update();
						pendingId = null;
					}}
			>
				<input type="hidden" name="id" value={pending.id} />
				<p class="text-ink">
					{#if pendingUsage > 0}
						La liste « {pending.name} » est utilisée par {pendingUsage}
						{pendingUsage > 1 ? 'campagnes' : 'campagne'} : elle sera archivée (masquée de cette page
						et du choix pour les nouvelles campagnes) mais restera visible dans les campagnes et rapports
						existants.
					{:else}
						Supprimer définitivement la liste « {pending.name} » et tous ses destinataires ? Elle n'est
						utilisée par aucune campagne. Cette action est irréversible.
					{/if}
				</p>
				<div class="flex gap-3 max-md:flex-col">
					<Button type="submit" variant="danger" class="max-md:w-full">
						{pendingUsage > 0 ? 'Archiver' : 'Supprimer définitivement'}
					</Button>
					<Button variant="ghost" class="max-md:w-full" onclick={() => (pendingId = null)}>
						Annuler
					</Button>
				</div>
			</form>
		</Panel>
	{:else if form && 'removed' in form}
		<p class="text-ink-dim" role="status">
			{form.removed === 'deleted' ? 'Liste supprimée.' : 'Liste archivée.'}
		</p>
	{:else if form && 'restored' in form}
		<p class="text-ink-dim" role="status">Liste restaurée.</p>
	{/if}

	<Panel flush>
		{#snippet header()}
			<div class="flex w-full items-center justify-between gap-3">
				<h2 class="rf-title">Listes de destinataires</h2>
				<Button href={archivedHref} variant="ghost" size="sm">
					{data.showArchived ? 'Masquer les archivées' : 'Afficher les archivées'}
				</Button>
			</div>
		{/snippet}
		{#if data.lists.length === 0}
			<EmptyState
				title="Aucune liste"
				message="Créez la première liste avec le formulaire ci-dessus, puis importez des destinataires."
			/>
		{:else}
			<ul class="divide-y divide-line md:hidden">
				{#each data.lists as l (l.id)}
					<li class="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
						<span class="flex min-w-0 items-center gap-2">
							<a href="/lists/{l.id}" class="font-medium [overflow-wrap:anywhere] text-ink">
								{l.name}
							</a>
							{#if l.archived}<Plate variant="neutral">Archivée</Plate>{/if}
						</span>
						{@render rowActions(l)}
					</li>
				{/each}
			</ul>
			<div class="max-md:hidden">
				<table class="w-full text-left">
					<thead class="border-b border-line">
						<tr>
							<th class="rf-label px-4 py-2.5">Nom</th>
							<th class="rf-label px-4 py-2.5">Statut</th>
							<th class="rf-label px-4 py-2.5 text-right">Actions</th>
						</tr>
					</thead>
					<tbody class="divide-y divide-line">
						{#each data.lists as l (l.id)}
							<tr class="rf-row">
								<td class="px-4 py-3">
									<a
										href="/lists/{l.id}"
										class="rf-row-link font-medium [overflow-wrap:anywhere] text-ink"
									>
										{l.name}
									</a>
								</td>
								<td class="px-4 py-3 text-ink-dim">
									{#if l.archived}<Plate variant="neutral">Archivée</Plate>{:else}Active{/if}
								</td>
								<td class="px-4 py-3 text-right">
									<span class="relative z-10 inline-flex">{@render rowActions(l)}</span>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	</Panel>
</Page>
