<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button, ErrorNotice, Field, Panel } from '$lib/components/ui';
	import { localeLabel } from '$lib/scenario-labels';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const isSuperadmin = $derived(data.user.role === 'superadmin');

	let showDelete = $state(false);
	let confirmName = $state('');
	const nameMatches = $derived(confirmName.trim() === data.tenant.name);
</script>

<main class="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-6 md:px-6 md:py-8">
	<header class="flex flex-wrap items-end justify-between gap-3">
		<div class="min-w-0">
			<p class="rf-eyebrow">Paramètres du client</p>
			<h1 class="mt-1 text-2xl font-semibold tracking-tight [overflow-wrap:anywhere] text-ink">
				{data.tenant.name}
			</h1>
		</div>
		<Button href="/tenants" variant="ghost" size="sm" class="max-sm:w-full">
			Tous les clients
		</Button>
	</header>

	{#if !data.isActive}
		<!-- Consulter les paramètres ne change pas le client actif : le changement est explicite. -->
		<form
			method="POST"
			action="/set-tenant"
			class="flex flex-col gap-3 rounded-lg border border-line-strong bg-surface-1 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
		>
			<input type="hidden" name="tenantId" value={data.tenant.id} />
			<input type="hidden" name="redirectTo" value="/dashboard" />
			<p class="text-ink-dim">
				Ce n'est pas le client sur lequel vous travaillez. Ses campagnes, destinataires et profils
				d'envoi s'affichent une fois qu'il est le client actif.
			</p>
			<Button type="submit" variant="secondary" class="w-full sm:w-auto sm:shrink-0">
				Travailler sur ce client
			</Button>
		</form>
	{/if}

	<Panel>
		{#snippet header()}
			<h2 class="rf-label">Identité</h2>
		{/snippet}
		<dl class="grid gap-4 sm:grid-cols-2">
			<div>
				<dt class="rf-label">Nom</dt>
				<dd class="mt-1 [overflow-wrap:anywhere] text-ink">{data.tenant.name}</dd>
			</div>
			<div>
				<dt class="rf-label">Langue</dt>
				<dd class="mt-1 text-ink">{localeLabel(data.tenant.locale)}</dd>
			</div>
		</dl>
		<p class="mt-4 text-xs text-ink-dim">Le nom et la langue sont fixés à la création du client.</p>
	</Panel>

	<Panel>
		{#snippet header()}
			<h2 class="rf-label">Contact et fuseau horaire</h2>
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
						value={form?.timezone || data.contact.timezone}
					/>
					<datalist id="tz-list">
						{#each data.timezones as tz (tz)}<option value={tz}></option>{/each}
					</datalist>
				{/snippet}
			</Field>
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
				<p class="text-signal" role="status">Paramètres enregistrés.</p>
			{/if}
			<div>
				<Button type="submit" variant="primary" class="max-md:w-full">Enregistrer</Button>
			</div>
		</form>
	</Panel>

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
