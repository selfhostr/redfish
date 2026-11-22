<script lang="ts">
	import { enhance } from '$app/forms';
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
					placeholder="Ex. Fiduciaire Alpina SA"
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
			<Field
				label="Fuseau horaire"
				name="timezone"
				help="Fuseau IANA utilisé pour saisir et afficher les dates des campagnes."
			>
				{#snippet input()}
					<input
						id="field-timezone"
						name="timezone"
						list="tz-list"
						autocomplete="off"
						class="rf-input"
						value={form?.timezone || data.defaultTimezone}
					/>
					<datalist id="tz-list">
						{#each data.timezones as tz (tz)}<option value={tz}></option>{/each}
					</datalist>
				{/snippet}
			</Field>
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
			message="Un client est l'entreprise que vous sensibilisez : ses destinataires, profils d'envoi et campagnes sont isolés des autres clients. Créez le premier pour commencer."
		/>
	{:else}
		<div class="overflow-x-auto rounded-md border border-line bg-surface-1">
			<table class="w-full min-w-[44rem] text-left">
				<caption class="sr-only">Vue d'ensemble des clients</caption>
				<thead>
					<tr class="border-b border-line">
						<th scope="col" class="rf-label px-4 py-2 font-normal">Client</th>
						<th scope="col" class="rf-label px-4 py-2 font-normal">Langue</th>
						<th scope="col" class="rf-label px-4 py-2 text-right font-normal">Campagnes</th>
						<th scope="col" class="rf-label px-4 py-2 text-right font-normal">Destinataires</th>
						<th scope="col" class="rf-label px-4 py-2 text-right font-normal">Taux de clic</th>
						<th scope="col" class="rf-label px-4 py-2 font-normal">Dernière campagne</th>
						<th scope="col" class="px-4 py-2"><span class="sr-only">Actions</span></th>
					</tr>
				</thead>
				<tbody>
					{#each data.overviews as t (t.id)}
						<tr class="border-b border-line last:border-b-0">
							<th scope="row" class="px-4 py-2.5 font-medium [overflow-wrap:anywhere] text-ink">
								<a href="/tenants/{t.id}" class="hover:underline">{t.name}</a>
								{#if t.id === data.activeTenant?.id}
									<span
										class="ml-2 inline-block size-2 rounded-full bg-signal align-middle"
										title="Client actif"
										role="img"
										aria-label="Client actif"
									></span>
								{/if}
							</th>
							<td class="px-4 py-2.5 font-mono text-xs text-ink-dim uppercase">{t.locale}</td>
							<td class="px-4 py-2.5 text-right text-ink tabular-nums">{t.campaignCount}</td>
							<td class="px-4 py-2.5 text-right text-ink tabular-nums">{t.recipientCount}</td>
							<td class="px-4 py-2.5 text-right text-ink tabular-nums">{pct(t.lastClickRate)}</td>
							<td class="px-4 py-2.5 text-ink-dim">
								{#if t.lastCampaign}
									<LocalTime value={t.lastCampaign.createdAt} />
								{:else}
									—
								{/if}
							</td>
							<td class="px-4 py-2.5 text-right">
								<a href="/tenants/{t.id}" class="text-ink-dim hover:text-ink hover:underline">
									Paramètres
								</a>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</main>
