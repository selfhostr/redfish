<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import { localNext } from '$lib/return-path';
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

	const fields: [string, string, string, string?][] = [
		['name', 'Nom', 'text'],
		['host', 'Hôte SMTP', 'text'],
		['port', 'Port', 'number'],
		['username', 'Utilisateur', 'text'],
		['password', 'Mot de passe', 'password'],
		[
			'fromName',
			'Nom expéditeur',
			'text',
			'Nom affiché par défaut. Un scénario peut imposer le sien à la place.'
		],
		[
			'fromAddress',
			'Adresse expéditeur',
			'email',
			"C'est toujours cette adresse qui sert d'expéditeur, quel que soit le scénario."
		]
	];
	const editFields = fields.filter(([n]) => n !== 'password');
	let editing = $state<string | null>(null);
	// Le formulaire de création s'ouvre à la demande, ou de lui-même s'il revient en erreur.
	let creating = $state(false);
	$effect(() => {
		if (form?.error || (form?.success && next)) creating = true;
	});
	const summary = $derived(
		data.profiles.length === 0
			? "Aucun profil d'envoi : ajoutez un serveur SMTP pour pouvoir envoyer."
			: `${data.profiles.length} profil${data.profiles.length > 1 ? 's' : ''} d'envoi : serveur SMTP et expéditeur utilisés pour envoyer les e-mails d'une campagne.`
	);
</script>

<Page title="Profils d'envoi" description={summary}>
	{#snippet actions()}
		{#if !creating}
			<Button variant="primary" class="max-md:w-full" onclick={() => (creating = true)}>
				Nouveau profil
			</Button>
		{/if}
	{/snippet}

	{#if creating}
		<Panel>
			{#snippet header()}
				<h2 class="rf-title">Nouveau profil</h2>
				<Button variant="ghost" size="sm" onclick={() => (creating = false)}>Fermer</Button>
			{/snippet}
			<form method="POST" action="?/create" use:enhance class="flex flex-col gap-4">
				<p class="rf-meta">Tous les champs sont obligatoires.</p>
				<div class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
					{#each fields as [name, label, type, help] (name)}
						<Field {label} {name} {type} {help} required autocomplete="off" />
					{/each}
				</div>
				<p class="rf-meta">
					Avec l'hôte « mail » (module d'envoi intégré), l'adresse expéditeur doit utiliser le
					domaine du module, sinon DMARC échouera.
				</p>
				<details class="rounded-btn border border-line px-3 py-2">
					<summary class="min-h-8 cursor-pointer text-ink-dim">Options avancées</summary>
					<label class="mt-2 flex min-h-8 items-center gap-2">
						<input type="checkbox" name="global" class="h-4 w-4" />
						<span class="text-ink">Profil global (superadmin)</span>
					</label>
				</details>
				{#if form?.error}
					<ErrorNotice message={form.error} />
				{/if}
				<div class="flex flex-col gap-2 sm:flex-row">
					<Button type="submit" variant="primary" class="max-sm:w-full">Créer le profil</Button>
					{#if form?.success && next}
						<Button href={next} variant="primary" class="max-sm:w-full">
							Continuer la campagne
						</Button>
					{/if}
				</div>
			</form>
		</Panel>
	{/if}

	{#if data.profiles.length === 0}
		<EmptyState
			title="Aucun profil d'envoi"
			message="Configurez un serveur SMTP pour pouvoir envoyer vos campagnes."
		>
			{#if !creating}
				<Button variant="primary" onclick={() => (creating = true)}>Créer un profil</Button>
			{/if}
		</EmptyState>
	{:else}
		<Panel flush>
			<ul class="divide-y divide-line">
				{#each data.profiles as p (p.id)}
					<li class="flex flex-col gap-3 px-4 py-3">
						<div class="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
							<div class="flex min-w-0 flex-col gap-1">
								<span class="flex flex-wrap items-center gap-2">
									<span class="font-medium [overflow-wrap:anywhere] text-ink">{p.name}</span>
									{#if !p.tenantId}
										<Plate variant="neutral">Global</Plate>
									{/if}
								</span>
								<span class="font-mono [overflow-wrap:anywhere] text-ink-dim">
									{p.host}:{p.port}
								</span>
								<span class="flex flex-wrap items-center gap-2 text-ink-dim">
									<span class="font-mono [overflow-wrap:anywhere]">{p.fromAddress}</span>
									<CopyButton value={p.fromAddress} what="l'adresse expéditeur" size="sm" />
								</span>
							</div>
							<div class="flex flex-col gap-2 md:flex-row md:flex-wrap md:items-center">
								<form method="POST" action="?/verify" use:enhance class="contents">
									<input type="hidden" name="profileId" value={p.id} />
									<Button type="submit" class="max-md:w-full">Tester la connexion</Button>
								</form>
								<form
									method="POST"
									action="?/sendTest"
									use:enhance
									class="flex flex-col gap-2 md:flex-row"
								>
									<input type="hidden" name="profileId" value={p.id} />
									<input
										type="email"
										name="to"
										required
										readonly
										value={data.userEmail}
										aria-label="Adresse de test"
										class="rf-input font-mono md:w-64"
									/>
									<Button type="submit" class="max-md:w-full">Envoyer un e-mail de test</Button>
								</form>
								<Button
									class="max-md:w-full"
									onclick={() => (editing = editing === p.id ? null : p.id)}
								>
									Modifier
								</Button>
							</div>
						</div>
						{#if data.wrongDomainIds.includes(p.id)}
							<p class="text-warning" role="alert">
								Ce profil passe par le module d'envoi mais n'envoie pas depuis le domaine signé :
								DMARC échouera.
							</p>
						{/if}
						{#if editing === p.id || form?.editId === p.id}
							<form
								method="POST"
								action="?/update"
								use:enhance={() =>
									async ({ result, update }) => {
										await update({ reset: false });
										if (result.type === 'success') editing = null;
									}}
								class="flex flex-col gap-4 rounded-card border border-line bg-surface-2 p-4"
							>
								<input type="hidden" name="profileId" value={p.id} />
								<div class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
									{#each editFields as [name, label, type, help] (name)}
										<Field
											{label}
											{name}
											{type}
											{help}
											required
											autocomplete="off"
											value={String(p[name as keyof typeof p] ?? '')}
										/>
									{/each}
									<Field
										label="Mot de passe"
										name="password"
										type="password"
										autocomplete="new-password"
										help="Laisser vide pour conserver le mot de passe actuel."
									/>
								</div>
								{#if form?.editId === p.id && form.editError}
									<ErrorNotice message={form.editError} />
								{/if}
								<div class="flex gap-2">
									<Button type="submit" variant="primary">Enregistrer</Button>
									<Button onclick={() => (editing = null)}>Annuler</Button>
								</div>
							</form>
						{/if}
						{#if form?.editOk && form.editId === p.id}
							<p class="text-ink" role="status">{form.editOk}</p>
						{/if}
						{#if form?.profileId === p.id}
							{#if form.testError}
								<ErrorNotice message={form.testError} />
							{:else if form.testOk}
								<p class="text-ink" role="status">{form.testOk}</p>
							{/if}
						{/if}
					</li>
				{/each}
			</ul>
		</Panel>
	{/if}
</Page>
