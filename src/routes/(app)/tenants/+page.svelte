<script lang="ts">
	import { enhance } from '$app/forms';
	import StatusPill from '$lib/components/StatusPill.svelte';
	import { Button, EmptyState, ErrorNotice, Field, LocalTime } from '$lib/components/ui';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const languages = [
		{ value: 'fr', label: 'Français' },
		{ value: 'de', label: 'Deutsch' },
		{ value: 'it', label: 'Italiano' },
		{ value: 'en', label: 'English' }
	];
	// Le formulaire s'ouvre de lui-même s'il revient en erreur.
	let creating = $state(false);
	$effect(() => {
		if (form?.error) creating = true;
	});
	let locale = $state('fr');
	$effect(() => {
		if (form?.locale) locale = form.locale;
	});
	const pct = (r: number | null) => (r === null ? '—' : `${Math.round(r * 100)} %`);
</script>

<main class="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-6 md:px-6 md:py-8">
	<div class="flex flex-wrap items-center justify-between gap-3">
		<h1 class="text-2xl font-semibold text-ink">Clients</h1>
		{#if !creating}
			<Button variant="secondary" class="max-md:w-full" onclick={() => (creating = true)}>
				Nouveau client
			</Button>
		{/if}
	</div>

	{#if creating}
		<form
			method="POST"
			use:enhance
			class="flex flex-col gap-4 rounded-md border border-line bg-surface-1 p-4"
		>
			<h2 class="rf-label">Nouveau client</h2>
			<div class="grid gap-4 sm:grid-cols-2">
				<Field
					label="Nom"
					name="name"
					required
					placeholder="Nom de l'organisation"
					value={form?.name ?? ''}
				/>
				<Field label="Langue" name="locale">
					{#snippet input()}
						<select id="field-locale" name="locale" class="rf-input" bind:value={locale}>
							{#each languages as l (l.value)}
								<option value={l.value}>{l.label}</option>
							{/each}
						</select>
					{/snippet}
				</Field>
			</div>
			<div class="grid gap-4 sm:grid-cols-2">
				<Field
					label="Contact (nom)"
					name="contactName"
					maxlength={120}
					autocomplete="off"
					value={form?.contactName ?? ''}
				/>
				<Field
					label="Contact (e-mail)"
					name="contactEmail"
					type="email"
					maxlength={254}
					autocomplete="off"
					value={form?.contactEmail ?? ''}
				/>
			</div>
			<Field label="Notes" name="notes">
				{#snippet input()}
					<textarea id="field-notes" name="notes" rows="3" maxlength="2000" class="rf-input"
						>{form?.notes ?? ''}</textarea
					>
				{/snippet}
			</Field>
			{#if form?.error}
				<ErrorNotice message={form.error} />
			{/if}
			<div class="flex flex-col gap-2 sm:flex-row">
				<Button type="submit" variant="primary" class="max-sm:w-full">Créer le client</Button>
				<Button variant="ghost" class="max-sm:w-full" onclick={() => (creating = false)}>
					Annuler
				</Button>
			</div>
		</form>
	{/if}

	{#if data.overviews.length === 0}
		<EmptyState
			title="Aucun client"
			message="Un client est une organisation dont les données sont isolées des autres. Créez le premier pour commencer."
		/>
	{:else}
		<ul class="grid gap-4 md:grid-cols-2">
			{#each data.overviews as t (t.id)}
				<li class="flex flex-col gap-4 rounded-md border border-line bg-surface-1 p-4">
					<div class="flex items-start justify-between gap-3">
						<h2 class="min-w-0 text-base font-semibold [overflow-wrap:anywhere] text-ink">
							{t.name}
						</h2>
						<span class="font-mono text-xs text-ink-dim uppercase">{t.locale}</span>
					</div>
					<dl class="grid grid-cols-3 gap-2">
						<div>
							<dt class="rf-label">Campagnes</dt>
							<dd class="text-ink">{t.campaignCount}</dd>
						</div>
						<div>
							<dt class="rf-label">Destinataires</dt>
							<dd class="text-ink">{t.recipientCount}</dd>
						</div>
						<div>
							<dt class="rf-label">Taux de clic</dt>
							<dd class="text-ink">{pct(t.lastClickRate)}</dd>
						</div>
					</dl>
					<p class="flex flex-wrap items-center gap-x-2 gap-y-1 text-ink-dim">
						{#if t.lastCampaign}
							<span class="min-w-0 [overflow-wrap:anywhere]">{t.lastCampaign.name}</span>
							<StatusPill status={t.lastCampaign.status} />
							<LocalTime value={t.lastCampaign.createdAt} />
						{:else}
							Aucune campagne
						{/if}
					</p>
					<div class="mt-auto flex flex-col gap-2 sm:flex-row">
						<form method="POST" action="/set-tenant" class="contents">
							<input type="hidden" name="tenantId" value={t.id} />
							<input type="hidden" name="redirectTo" value="/campaigns/new" />
							<Button type="submit" variant="secondary" class="max-sm:w-full">
								Nouvelle campagne
							</Button>
						</form>
						<form method="POST" action="/set-tenant" class="contents">
							<input type="hidden" name="tenantId" value={t.id} />
							<input type="hidden" name="redirectTo" value="/tenants/{t.id}" />
							<Button type="submit" variant="secondary" class="max-sm:w-full">Ouvrir</Button>
						</form>
					</div>
				</li>
			{/each}
		</ul>
	{/if}
</main>
