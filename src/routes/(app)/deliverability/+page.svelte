<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button, CopyButton, ErrorNotice, Panel } from '$lib/components/ui';
	import type { CheckId, CheckStatus } from '$lib/server/deliverability/checks';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const titles: Record<CheckId, string> = {
		spf: 'SPF',
		dkim: 'DKIM',
		dmarc: 'DMARC',
		ptr: 'DNS inverse (PTR)',
		port25: 'Port 25 sortant',
		dnsbl: 'Listes de blocage',
		profileDomain: "Domaine des profils d'envoi"
	};
	const labels: Record<CheckStatus, string> = {
		ok: 'OK',
		warn: 'Attention',
		fail: 'Échec',
		unknown: 'Non vérifiable'
	};
	const tone: Record<CheckStatus, string> = {
		ok: 'text-signal',
		warn: 'text-warning',
		fail: 'text-danger',
		unknown: 'text-ink-dim'
	};
	const stateLabel = { none: 'Non configuré', stopped: 'Arrêté', running: 'En marche' } as const;
</script>

<main class="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-6 md:px-6 md:py-8">
	<div>
		<h1 class="text-lg font-semibold tracking-tight text-ink">Délivrabilité</h1>
		<p class="text-ink-dim">
			Diagnostic du domaine d'envoi : SPF, DKIM, DMARC, DNS inverse, port 25 et listes de blocage.
		</p>
	</div>

	<Panel>
		<p class="text-ink">
			Pour une simulation d'hameçonnage, ces réglages ne suffisent pas : le client doit aussi
			autoriser l'expéditeur chez lui (Microsoft 365 « Advanced delivery » pour les simulations de
			tiers, listes d'autorisation de Google Workspace). Voir
			<a
				class="underline"
				href="https://github.com/selfhostr/redfish/blob/main/docs/self-hosted-sending.md"
			>
				la documentation
			</a>.
		</p>
	</Panel>

	{#if form?.error}
		<ErrorNotice title="Action impossible" message={form.error} />
	{/if}

	<Panel>
		{#snippet header()}
			<h2 class="rf-label">Domaine</h2>
		{/snippet}
		{#if data.domain}
			<form method="GET" class="flex flex-wrap items-end gap-3">
				<label class="flex flex-col gap-1">
					<span class="text-ink-dim">Domaine d'envoi</span>
					<select name="domain" class="min-h-8 rounded-md border border-line bg-transparent px-2">
						{#each data.domains as d (d)}
							<option value={d} selected={d === data.domain}>{d}</option>
						{/each}
					</select>
				</label>
				{#if !data.isModuleDomain}
					<label class="flex flex-col gap-1">
						<span class="text-ink-dim">Sélecteur DKIM (optionnel)</span>
						<input
							name="selector"
							value={data.selector ?? ''}
							autocomplete="off"
							class="min-h-8 rounded-md border border-line bg-transparent px-2 font-mono"
						/>
					</label>
				{/if}
				<Button type="submit">Afficher</Button>
			</form>
		{:else}
			<p class="text-ink-dim">
				Aucun domaine à vérifier : créez un profil d'envoi ou configurez le module d'envoi.
			</p>
		{/if}
	</Panel>

	{#if data.domain}
		<Panel flush>
			{#snippet header()}
				<div class="flex flex-wrap items-center justify-between gap-3">
					<h2 class="rf-label">{data.domain}</h2>
					<form method="POST" action="?/recheck" use:enhance>
						<input type="hidden" name="domain" value={data.domain} />
						<input type="hidden" name="selector" value={data.selector ?? ''} />
						<Button type="submit">Relancer les vérifications</Button>
					</form>
				</div>
			{/snippet}
			<ul class="flex flex-col divide-y divide-line">
				{#each data.checks as c (c.id)}
					<li class="flex flex-col gap-1 px-4 py-3" data-check={c.id}>
						<div class="flex flex-wrap items-baseline gap-2">
							<span class="font-medium text-ink">{titles[c.id]}</span>
							<span class="font-medium {tone[c.status]}">{labels[c.status]}</span>
						</div>
						<p class="text-ink">{c.message}</p>
						{#if c.fix}<p class="text-ink-dim">{c.fix}</p>{/if}
						{#if c.record}
							<div class="flex flex-col gap-1 rounded-md border border-line px-3 py-2 font-mono">
								<span class="flex items-start gap-2">
									<span class="text-ink-dim">{c.record.type}</span>
									<span class="[overflow-wrap:anywhere]">{c.record.name}</span>
									<CopyButton value={c.record.name} what="le nom de l'enregistrement" />
								</span>
								<span class="flex items-start gap-2">
									<span class="[overflow-wrap:anywhere]">{c.record.value}</span>
									<CopyButton value={c.record.value} what="la valeur de l'enregistrement" />
								</span>
							</div>
						{/if}
					</li>
				{/each}
			</ul>
			{#if data.checkedAt}
				<p class="px-4 py-2 text-ink-dim">
					Résultats mis en cache 5 minutes (vérifié à {new Date(data.checkedAt).toLocaleTimeString(
						'fr-CH'
					)}).
				</p>
			{/if}
		</Panel>
	{/if}

	<Panel>
		{#snippet header()}
			<h2 class="rf-label">Module d'envoi intégré : {stateLabel[data.module.state]}</h2>
		{/snippet}
		<div class="flex flex-col gap-3">
			{#if data.module.state !== 'running'}
				<p class="text-ink">
					Un serveur d'envoi optionnel, livré avec redfish, envoie directement sans filtre d'un
					tiers. Il exige que votre hébergeur autorise le port 25 sortant.
				</p>
				<p class="text-ink-dim">Ajoutez ces valeurs à votre fichier .env :</p>
				<pre class="overflow-x-auto rounded-md border border-line px-3 py-2 font-mono">{data.module
						.envBlock}</pre>
				<CopyButton value={data.module.envBlock} what="le bloc .env" label="Copier le bloc .env" />
				<p class="text-ink-dim">Puis démarrez le module :</p>
				<pre
					class="overflow-x-auto rounded-md border border-line px-3 py-2 font-mono">docker compose --profile mail up -d</pre>
				<CopyButton
					value="docker compose --profile mail up -d"
					what="la commande"
					label="Copier la commande"
				/>
			{:else}
				<p class="text-ink">
					Le module répond sur mail:587. Vous pouvez créer le profil d'envoi correspondant.
				</p>
			{/if}
			{#if data.module.state !== 'none'}
				{#if form?.profileMessage}
					<p class="text-ink" role="status">{form.profileMessage}</p>
				{/if}
				{#if data.module.profileExists}
					<p class="text-ink-dim">Un profil d'envoi du module existe déjà.</p>
				{:else}
					<form method="POST" action="?/createModuleProfile" use:enhance>
						<Button type="submit" variant="primary">Créer le profil d'envoi du module</Button>
					</form>
				{/if}
			{/if}
		</div>
	</Panel>
</main>
