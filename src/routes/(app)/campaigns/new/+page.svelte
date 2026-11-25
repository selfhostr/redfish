<script lang="ts">
	import { onMount } from 'svelte';
	import { enhance } from '$app/forms';
	import { Button, ErrorNotice, Field, Page, Panel } from '$lib/components/ui';
	import AuthorizationFields from '$lib/components/campaigns/AuthorizationFields.svelte';
	import ScenarioPicker from '$lib/components/campaigns/ScenarioPicker.svelte';
	import SendingPaceFields from '$lib/components/campaigns/SendingPaceFields.svelte';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const hasProfiles = $derived(data.profiles.length > 0);
	const hasLists = $derived(data.lists.length > 0);
	const ready = $derived(data.scenarios.length > 0 && hasProfiles && hasLists);

	const monthYear = new Date().toLocaleDateString('fr-CH', { month: 'long', year: 'numeric' });

	// Valeurs initiales : un seul choix existant est présélectionné.
	/* svelte-ignore state_referenced_locally */
	const init = {
		profile: data.profiles[0]?.id ?? '',
		list: data.lists[0]?.id ?? '',
		tracking: data.defaults.trackingDomain,
		auth: data.defaults.authorization
	};

	let scenarioId = $state('');
	let name = $state('');
	let nameTouched = $state(false);
	let sendingProfileId = $state(init.profile);
	let targetListId = $state(init.list);
	let changeProfile = $state(false);
	let changeList = $state(false);
	let trackingDomain = $state(init.tracking);
	let reference = $state(init.auth?.reference ?? '');
	let approvedBy = $state(init.auth?.approvedBy ?? '');
	let validFrom = $state(init.auth?.validFrom ?? '');
	let validUntil = $state(init.auth?.validUntil ?? '');
	let editAuth = $state(false);
	let awarenessMessage = $state('');
	let advancedOpen = $state(false);
	let restored = $state(false);

	const hasAuthDefault = init.auth !== null;
	const hasTrackingDefault = init.tracking !== '';
	const profile = $derived(data.profiles.find((p) => p.id === sendingProfileId));
	const list = $derived(data.lists.find((l) => l.id === targetListId));

	function pickScenario(id: string) {
		scenarioId = id;
		const s = data.scenarios.find((x) => x.id === id);
		if (s && !nameTouched) name = `${s.title} · ${monthYear}`;
	}

	const storageKey = $derived(`redfish:new-campaign:${data.tenantId}`);

	onMount(() => {
		try {
			const raw = sessionStorage.getItem(storageKey);
			if (raw) {
				const v = JSON.parse(raw);
				const str = (x: unknown, d: string) => (typeof x === 'string' ? x : d);
				if (data.scenarios.some((s) => s.id === v.scenarioId)) scenarioId = v.scenarioId;
				if (data.profiles.some((p) => p.id === v.sendingProfileId))
					sendingProfileId = v.sendingProfileId;
				if (data.lists.some((l) => l.id === v.targetListId)) targetListId = v.targetListId;
				name = str(v.name, name);
				nameTouched = v.nameTouched === true;
				trackingDomain = str(v.trackingDomain, trackingDomain);
				reference = str(v.reference, reference);
				approvedBy = str(v.approvedBy, approvedBy);
				validFrom = str(v.validFrom, validFrom);
				validUntil = str(v.validUntil, validUntil);
				awarenessMessage = str(v.awarenessMessage, awarenessMessage);
			}
		} catch {
			/* stockage indisponible ou contenu invalide : on ignore */
		}
		restored = true;
	});

	$effect(() => {
		const snapshot = {
			scenarioId,
			name,
			nameTouched,
			sendingProfileId,
			targetListId,
			trackingDomain,
			reference,
			approvedBy,
			validFrom,
			validUntil,
			awarenessMessage
		};
		if (!restored) return;
		try {
			sessionStorage.setItem(storageKey, JSON.stringify(snapshot));
		} catch {
			/* ignoré */
		}
	});
</script>

<Page
	title="Nouvelle campagne"
	description="Choisissez un scénario, une liste de destinataires et une autorisation, puis créez la campagne en brouillon."
>
	{#snippet actions()}
		<Button
			type="submit"
			form="new-campaign"
			variant="primary"
			disabled={!ready}
			class="max-md:w-full"
		>
			Créer la campagne
		</Button>
	{/snippet}

	<form
		id="new-campaign"
		method="POST"
		class="grid items-start gap-4 xl:grid-cols-3"
		use:enhance={() => {
			return async ({ result, update }) => {
				if (result.type === 'redirect') {
					try {
						sessionStorage.removeItem(storageKey);
					} catch {
						/* ignoré */
					}
				}
				await update({ reset: false });
			};
		}}
	>
		<div class="flex min-w-0 flex-col gap-4 xl:col-span-2">
			<ScenarioPicker scenarios={data.scenarios} {scenarioId} onpick={pickScenario} />

			<Panel>
				<div class="flex flex-col gap-4">
					<h2 class="rf-title">Campagne</h2>
					<div class="grid gap-4 md:grid-cols-2">
						<Field
							label="Nom de la campagne"
							name="name"
							required
							placeholder="Ex. Sensibilisation Q1, Finance"
							bind:value={name}
							oninput={() => (nameTouched = true)}
						/>

						<!-- Profil d'envoi -->
						<div class="flex flex-col gap-1.5">
							{#if !hasProfiles}
								<span class="rf-label">Profil d'envoi</span>
								<p class="rounded-btn bg-surface-2 px-3 py-2 text-ink-dim">
									Aucun profil d'envoi.
									<a href="/sending-profiles?next=/campaigns/new" class="rf-link">
										Créer un profil d'envoi
									</a>
								</p>
							{:else if data.profiles.length === 1 && !changeProfile}
								<span class="rf-label">Profil d'envoi</span>
								<input type="hidden" name="sendingProfileId" value={sendingProfileId} />
								<div class="summary">
									<span class="summary-text">{profile?.name}</span>
									<button type="button" class="rf-link" onclick={() => (changeProfile = true)}>
										Changer
									</button>
								</div>
							{:else}
								<Field label="Profil d'envoi" id="field-sendingProfileId">
									{#snippet input()}
										<select
											id="field-sendingProfileId"
											name="sendingProfileId"
											required
											class="rf-input w-full max-w-full min-w-0"
											bind:value={sendingProfileId}
										>
											{#each data.profiles as p (p.id)}<option value={p.id}>{p.name}</option>{/each}
										</select>
									{/snippet}
								</Field>
							{/if}
						</div>

						<!-- Liste de cibles -->
						<div class="flex flex-col gap-1.5">
							{#if !hasLists}
								<span class="rf-label">Liste de destinataires</span>
								<p class="rounded-btn bg-surface-2 px-3 py-2 text-ink-dim">
									Aucune liste.
									<a href="/lists?next=/campaigns/new" class="rf-link">Créer une liste</a>
								</p>
							{:else if data.lists.length === 1 && !changeList}
								<span class="rf-label">Liste de destinataires</span>
								<input type="hidden" name="targetListId" value={targetListId} />
								<div class="summary">
									<span class="summary-text">{list?.name}</span>
									<button type="button" class="rf-link" onclick={() => (changeList = true)}>
										Changer
									</button>
								</div>
							{:else}
								<Field label="Liste de destinataires" id="field-targetListId">
									{#snippet input()}
										<select
											id="field-targetListId"
											name="targetListId"
											required
											class="rf-input w-full max-w-full min-w-0"
											bind:value={targetListId}
										>
											{#each data.lists as l (l.id)}<option value={l.id}>{l.name}</option>{/each}
										</select>
									{/snippet}
								</Field>
							{/if}
							{#if list && list.targetCount === 0}
								<div
									class="rounded-card border border-line-strong border-l-signal bg-signal-bg px-4 py-3 text-ink"
									role="alert"
								>
									La liste « {list.name} » ne contient aucun destinataire : la campagne n'enverra rien.
									<a href="/lists/{list.id}?next=/campaigns/new" class="rf-link">
										Ajouter des destinataires
									</a>
								</div>
							{/if}
						</div>

						{#if !hasTrackingDefault}
							<Field
								label="Domaine de tracking"
								name="trackingDomain"
								required
								placeholder="track.exemple.com"
								bind:value={trackingDomain}
							/>
						{/if}
					</div>
				</div>
			</Panel>
		</div>

		<div class="flex min-w-0 flex-col gap-4">
			<AuthorizationFields
				bind:reference
				bind:approvedBy
				bind:validFrom
				bind:validUntil
				bind:editAuth
				timezone={data.timezone}
				{hasAuthDefault}
			/>

			<Panel>
				<SendingPaceFields timezone={data.timezone} />
			</Panel>

			<details class="advanced" bind:open={advancedOpen}>
				<summary>Options avancées</summary>
				<div class="flex flex-col gap-4 pt-4">
					{#if hasTrackingDefault}
						<Field
							label="Domaine de tracking"
							name="trackingDomain"
							required
							placeholder="track.exemple.com"
							bind:value={trackingDomain}
						/>
					{/if}
					<Field label="Message de sensibilisation" id="field-awarenessMessage">
						{#snippet input()}
							<textarea
								id="field-awarenessMessage"
								name="awarenessMessage"
								rows="3"
								class="rf-input"
								placeholder="Message affiché à la cible après interaction (optionnel)."
								bind:value={awarenessMessage}></textarea>
						{/snippet}
					</Field>
				</div>
			</details>

			{#if form?.error}
				<ErrorNotice title="Création impossible" message={form.error} />
			{/if}
			{#if !ready}
				<p class="rf-meta">
					Complétez les éléments manquants (scénario, profil d'envoi, liste) pour pouvoir créer la
					campagne.
				</p>
			{/if}
		</div>
	</form>
</Page>

<style>
	.summary {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		min-width: 0;
		background: var(--c-surface-2);
		border: 1px solid var(--c-line-strong);
		border-radius: var(--r-btn);
		padding: 0.5rem 0.75rem;
		font-size: 0.8125rem;
	}
	.summary-text {
		min-width: 0;
		overflow-wrap: anywhere;
		color: var(--c-ink);
	}
	.summary button {
		flex: none;
		padding: 0.375rem 0;
		background: none;
		border: 0;
		cursor: pointer;
	}
	.advanced {
		border: 1px solid var(--c-line-strong);
		border-radius: var(--r-btn);
		padding: 0.75rem 0.875rem;
	}
	.advanced summary {
		cursor: pointer;
		color: var(--c-ink-dim);
		font-size: 0.8125rem;
		padding: 0.25rem 0;
	}
</style>
