<script lang="ts">
	import { enhance } from '$app/forms';
	import ClientHeader from '$lib/components/ClientHeader.svelte';
	import StatusPill from '$lib/components/StatusPill.svelte';
	import { Button, EmptyState, ErrorNotice, Field, LocalTime, Panel } from '$lib/components/ui';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const o = $derived(data.isActive ? data.overview : null);
	const isSuperadmin = $derived(data.user.role === 'superadmin');

	let showDelete = $state(false);
	let confirmName = $state('');
	const nameMatches = $derived(confirmName.trim() === data.tenant.name);
	const steps = $derived(
		o
			? [
					{ done: o.listCount > 0, label: 'Créer une liste de destinataires', href: '/lists' },
					{
						done: o.profileCount > 0,
						label: "Ajouter un profil d'envoi",
						href: '/sending-profiles'
					},
					{
						done: o.campaignCount > 0,
						label: 'Lancer une première campagne',
						href: '/campaigns/new'
					}
				]
			: []
	);
	const complete = $derived(steps.length > 0 && steps.every((s) => s.done));
	const pct = (r: number | null) => (r === null ? '—' : `${Math.round(r * 100)} %`);
</script>

<main class="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-6 md:px-6 md:py-8">
	{#if !data.isActive}
		<h1 class="text-2xl font-semibold tracking-tight [overflow-wrap:anywhere] text-ink">
			{data.tenant.name}
		</h1>
		<Panel>
			{#snippet header()}
				<h2 class="rf-label">Activer ce client</h2>
			{/snippet}
			<form method="POST" action="/set-tenant" class="flex flex-col gap-4">
				<input type="hidden" name="tenantId" value={data.tenant.id} />
				<input type="hidden" name="redirectTo" value="/tenants/{data.tenant.id}" />
				<p class="text-ink-dim">
					Ce client n'est pas celui sur lequel vous travaillez. Activez-le pour consulter sa fiche.
				</p>
				<Button type="submit" variant="primary" class="w-full md:w-auto md:self-start">
					Activer ce client
				</Button>
			</form>
		</Panel>
	{:else if o}
		<ClientHeader />

		<Panel>
			{#snippet header()}
				<h2 class="rf-label">Contact</h2>
			{/snippet}
			<form method="POST" action="?/update" use:enhance class="flex flex-col gap-4">
				<div class="grid gap-4 sm:grid-cols-2">
					<Field
						label="Nom du contact"
						name="contactName"
						maxlength={120}
						autocomplete="off"
						value={form?.contactName ?? data.contact.contactName ?? ''}
					/>
					<Field
						label="E-mail du contact"
						name="contactEmail"
						type="email"
						maxlength={254}
						autocomplete="off"
						value={form?.contactEmail ?? data.contact.contactEmail ?? ''}
					/>
				</div>
				<Field label="Notes" name="notes">
					{#snippet input()}
						<textarea id="field-notes" name="notes" rows="4" maxlength="2000" class="rf-input"
							>{form?.notes ?? data.contact.notes ?? ''}</textarea
						>
					{/snippet}
				</Field>
				{#if form?.contactError}
					<ErrorNotice message={form.contactError} />
				{:else if form?.saved}
					<p class="text-signal" role="status">Contact enregistré.</p>
				{/if}
				<div>
					<Button type="submit" variant="primary" class="max-md:w-full">Enregistrer</Button>
				</div>
			</form>
		</Panel>

		{#if !complete}
			<Panel>
				{#snippet header()}
					<h2 class="rf-label">Pour démarrer</h2>
				{/snippet}
				<ol class="flex flex-col gap-1">
					{#each steps as s, i (s.href)}
						<li>
							<a
								href={s.href}
								class="flex min-h-11 items-center gap-3 rounded-md px-1 text-ink hover:bg-surface-2"
							>
								<span
									class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-line-strong font-mono text-xs"
									class:text-signal={s.done}
									aria-hidden="true"
								>
									{s.done ? '✓' : i + 1}
								</span>
								<span class="min-w-0 grow [overflow-wrap:anywhere]" class:text-ink-dim={s.done}>
									{s.label}
								</span>
								<span
									class="shrink-0 text-xs"
									class:text-signal={s.done}
									class:text-ink-dim={!s.done}
								>
									{s.done ? 'Fait' : 'À faire'}
								</span>
							</a>
						</li>
					{/each}
				</ol>
			</Panel>
		{/if}

		<dl class="grid grid-cols-2 gap-3 md:grid-cols-4">
			{#each [['Campagnes', String(o.campaignCount)], ['Listes', String(o.listCount)], ['Destinataires', String(o.recipientCount)], ['Taux de clic', pct(o.lastClickRate)]] as [k, v] (k)}
				<div class="rounded-md border border-line bg-surface-1 px-4 py-3">
					<dt class="rf-label">{k}</dt>
					<dd class="text-xl font-semibold text-ink">{v}</dd>
				</div>
			{/each}
		</dl>

		<div class="flex flex-wrap items-center justify-between gap-3">
			<h2 class="text-lg font-semibold tracking-tight text-ink">Dernières campagnes</h2>
			<Button variant="primary" href="/campaigns/new" class="max-md:w-full">
				Nouvelle campagne
			</Button>
		</div>

		{#if data.latest.length === 0}
			<EmptyState
				title="Aucune campagne"
				message="Les campagnes de ce client apparaîtront ici dès la première création."
			/>
		{:else}
			<ul class="flex flex-col gap-3">
				{#each data.latest as c (c.id)}
					<li>
						<a
							href={`/campaigns/${c.id}`}
							class="flex flex-col gap-2 rounded-md border border-line bg-surface-1 px-4 py-3 hover:bg-surface-2"
						>
							<span class="flex items-start justify-between gap-3">
								<span class="min-w-0 font-medium break-words text-ink">{c.name}</span>
								<span class="shrink-0"><StatusPill status={c.status} /></span>
							</span>
							<span class="text-ink-dim">Créée le <LocalTime value={c.createdAt} /></span>
						</a>
					</li>
				{/each}
			</ul>
			<a href="/campaigns" class="text-ink-dim hover:text-ink hover:underline">
				Toutes les campagnes
			</a>
		{/if}
	{/if}

	{#if isSuperadmin}
		<Panel>
			{#snippet header()}
				<h2 class="rf-eyebrow">Zone de danger</h2>
			{/snippet}
			<div class="flex flex-col gap-4">
				<p class="text-ink-dim">
					Supprimer définitivement ce client efface toutes ses campagnes, listes, cibles, événements
					de suivi et profils d'envoi. Les autres clients et les profils d'envoi globaux ne sont pas
					touchés. Cette action est irréversible.
				</p>
				{#if form?.error}
					<ErrorNotice message={form.error} />
				{/if}
				{#if !showDelete}
					<div>
						<Button variant="danger" class="max-md:w-full" onclick={() => (showDelete = true)}>
							Supprimer ce client
						</Button>
					</div>
				{:else}
					<form method="POST" action="?/delete" use:enhance class="flex flex-col gap-3">
						<Field
							label="Confirmez en saisissant le nom du client"
							name="confirm"
							bind:value={confirmName}
							autocomplete="off"
							help={`Saisissez exactement : ${data.tenant.name}`}
						/>
						<div class="flex gap-3 max-md:flex-col">
							<Button type="submit" variant="danger" disabled={!nameMatches} class="max-md:w-full">
								Supprimer définitivement
							</Button>
							<Button
								variant="ghost"
								class="max-md:w-full"
								onclick={() => {
									showDelete = false;
									confirmName = '';
								}}
							>
								Annuler
							</Button>
						</div>
					</form>
				{/if}
			</div>
		</Panel>
	{/if}
</main>
