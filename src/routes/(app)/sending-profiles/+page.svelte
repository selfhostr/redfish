<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import ClientHeader from '$lib/components/ClientHeader.svelte';
	import { localNext } from '$lib/return-path';
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

	const fields: [string, string, string][] = [
		['name', 'Nom', 'text'],
		['host', 'Hôte SMTP', 'text'],
		['port', 'Port', 'number'],
		['username', 'Utilisateur', 'text'],
		['password', 'Mot de passe', 'password'],
		['fromName', 'Nom expéditeur', 'text'],
		['fromAddress', 'Adresse expéditeur', 'email']
	];
</script>

<main class="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-6 md:px-6 md:py-8">
	<ClientHeader />
	<h2 class="text-lg font-semibold tracking-tight text-ink">Profils d'envoi</h2>

	<p class="text-ink-dim">
		Un profil d'envoi décrit le serveur SMTP et l'expéditeur utilisés pour envoyer les e-mails d'une
		campagne.
	</p>

	<Panel flush>
		{#snippet header()}
			<h2 class="rf-label">Profils</h2>
		{/snippet}
		{#if data.profiles.length === 0}
			<EmptyState
				title="Aucun profil d'envoi"
				message="Configurez un serveur SMTP ci-dessous pour pouvoir envoyer."
			/>
		{:else}
			<ul class="divide-y divide-line">
				{#each data.profiles as p (p.id)}
					<li class="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
						<span class="font-medium [overflow-wrap:anywhere] text-ink">{p.name}</span>
						<span class="flex min-w-0 flex-wrap items-center gap-2 text-xs text-ink-dim">
							<span class="font-mono [overflow-wrap:anywhere]">{p.host}:{p.port}</span>
							<span class="font-mono [overflow-wrap:anywhere]">{p.fromAddress}</span>
							<CopyButton value={p.fromAddress} what="l'adresse expéditeur" size="sm" />
							{#if !p.tenantId}
								<Plate variant="neutral">Global</Plate>
							{/if}
						</span>
					</li>
				{/each}
			</ul>
		{/if}
	</Panel>

	<Panel>
		{#snippet header()}
			<h2 class="rf-label">Nouveau profil</h2>
		{/snippet}
		<form method="POST" use:enhance class="flex flex-col gap-4">
			<p class="text-ink-dim">Tous les champs sont obligatoires.</p>
			<div class="grid gap-4 sm:grid-cols-2">
				{#each fields as [name, label, type] (name)}
					<Field {label} {name} {type} required autocomplete="off" />
				{/each}
			</div>
			<details class="rounded-md border border-line px-3 py-2">
				<summary class="min-h-8 cursor-pointer text-ink-dim">Options avancées</summary>
				<label class="mt-2 flex min-h-8 items-center gap-2">
					<input type="checkbox" name="global" class="h-4 w-4" />
					<span class="text-ink">Profil global (superadmin)</span>
				</label>
			</details>
			{#if form?.error}
				<ErrorNotice message={form.error} />
			{/if}
			<Button type="submit" variant="primary" class="w-full md:w-auto md:self-start">
				Créer le profil
			</Button>
			{#if form?.success && next}
				<Button href={next} variant="primary" class="w-full md:w-auto md:self-start">
					Continuer la campagne
				</Button>
			{/if}
		</form>
	</Panel>
</main>
