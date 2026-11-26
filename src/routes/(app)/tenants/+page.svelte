<script lang="ts">
	import Icon from '$lib/components/shell/Icon.svelte';
	import { enhance } from '$app/forms';
	import {
		Button,
		EmptyState,
		ErrorNotice,
		Field,
		LocalTime,
		Page,
		Panel
	} from '$lib/components/ui';
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
	const summary = $derived(
		data.overviews.length === 0
			? 'Aucun client pour le moment.'
			: `${data.overviews.length} client${data.overviews.length > 1 ? 's' : ''}. Ouvrez-en un pour modifier son contact et son fuseau horaire.`
	);
	const pct = (r: number | null) => (r === null ? '—' : `${Math.round(r * 100)} %`);
</script>

<Page title="Clients" description={summary}>
	{#snippet actions()}
		{#if !creating}
			<Button variant="primary" class="max-md:w-full" onclick={() => (creating = true)}>
				Nouveau client
			</Button>
		{/if}
	{/snippet}

	{#if creating}
		<Panel>
			{#snippet header()}
				<h2 class="rf-title">Nouveau client</h2>
			{/snippet}
			<form method="POST" use:enhance class="flex flex-col gap-4">
				<div class="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
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
				<div class="grid gap-4 md:grid-cols-2">
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
				</div>
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
		</Panel>
	{/if}

	{#if data.overviews.length === 0}
		<EmptyState
			title="Aucun client"
			message="Un client est l'entreprise que vous sensibilisez : ses destinataires, profils d'envoi et campagnes sont isolés des autres clients. Créez le premier pour commencer."
		>
			{#if !creating}
				<Button variant="primary" onclick={() => (creating = true)}>Créer un client</Button>
			{/if}
		</EmptyState>
	{:else}
		<ul class="flex flex-col gap-3 md:hidden">
			{#each data.overviews as t (t.id)}
				<li>
					<a
						href="/tenants/{t.id}"
						class="flex flex-col gap-2 rounded-card border border-line bg-surface-1 px-4 py-3 active:bg-surface-2"
					>
						<span class="flex items-start justify-between gap-3">
							<span class="min-w-0 font-medium [overflow-wrap:anywhere] text-ink">{t.name}</span>
							{#if t.id === data.activeTenant?.id}
								<span class="shrink-0 rf-meta">Client actif</span>
							{/if}
						</span>
						<span class="flex flex-col gap-0.5 text-ink-dim">
							<span>
								{t.campaignCount} campagne{t.campaignCount > 1 ? 's' : ''} · {t.recipientCount}
								destinataire{t.recipientCount > 1 ? 's' : ''}
							</span>
							<span>Taux de clic : {pct(t.lastClickRate)}</span>
							<span>
								Dernière campagne :
								{#if t.lastCampaign}<LocalTime value={t.lastCampaign.createdAt} />{:else}—{/if}
							</span>
						</span>
					</a>
				</li>
			{/each}
		</ul>
		<div class="max-md:hidden">
			<Panel flush>
				<div class="overflow-x-auto">
					<table class="w-full text-left">
						<caption class="sr-only">Vue d'ensemble des clients</caption>
						<thead class="border-b border-line">
							<tr>
								<th scope="col" class="rf-label px-4 py-2.5">Client</th>
								<th scope="col" class="rf-label px-4 py-2.5">Langue</th>
								<th scope="col" class="rf-label px-4 py-2.5 text-right">Campagnes</th>
								<th scope="col" class="rf-label px-4 py-2.5 text-right">Destinataires</th>
								<th scope="col" class="rf-label px-4 py-2.5 text-right">Taux de clic</th>
								<th scope="col" class="rf-label px-4 py-2.5">Dernière campagne</th>
								<th scope="col" class="px-4 py-2.5"><span class="sr-only">Actions</span></th>
							</tr>
						</thead>
						<tbody class="divide-y divide-line">
							{#each data.overviews as t (t.id)}
								<tr class="rf-row">
									<th scope="row" class="px-4 py-3 font-medium [overflow-wrap:anywhere] text-ink">
										<a href="/tenants/{t.id}" class="rf-row-link">{t.name}</a>
										{#if t.id === data.activeTenant?.id}
											<span
												class="ml-2 inline-block size-2 rounded-full bg-signal align-middle"
												title="Client actif"
												role="img"
												aria-label="Client actif"
											></span>
										{/if}
									</th>
									<td class="px-4 py-3 font-mono text-ink-dim uppercase">{t.locale}</td>
									<td class="px-4 py-3 text-right text-ink tabular-nums">{t.campaignCount}</td>
									<td class="px-4 py-3 text-right text-ink tabular-nums">{t.recipientCount}</td>
									<td class="px-4 py-3 text-right text-ink tabular-nums">{pct(t.lastClickRate)}</td>
									<td class="px-4 py-3 text-ink-dim">
										{#if t.lastCampaign}
											<LocalTime value={t.lastCampaign.createdAt} />
										{:else}
											—
										{/if}
									</td>
									<td class="px-4 py-3 text-ink-dim">
										<span class="flex justify-end"><Icon name="chevronRight" size={16} /></span>
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			</Panel>
		</div>
	{/if}
</Page>
