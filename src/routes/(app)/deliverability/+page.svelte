<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button, CopyButton, ErrorNotice, Page, Panel, Plate } from '$lib/components/ui';
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
	const tone: Record<CheckStatus, 'signal' | 'advisory' | 'warning' | 'neutral'> = {
		ok: 'signal',
		warn: 'advisory',
		fail: 'warning',
		unknown: 'neutral'
	};
	const stateLabel = { none: 'Non configuré', stopped: 'Arrêté', running: 'En marche' } as const;
</script>

<Page
	title="Délivrabilité"
	description="Diagnostic du domaine d'envoi : SPF, DKIM, DMARC, DNS inverse, port 25 et listes de blocage."
>
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
			<h2 class="rf-title">Domaine</h2>
		{/snippet}
		{#if data.domain}
			<form method="GET" class="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-end">
				<div class="flex flex-col gap-1.5">
					<label class="rf-label" for="f-domain">Domaine d'envoi</label>
					<select id="f-domain" name="domain" class="rf-input md:w-72">
						{#each data.domains as d (d)}
							<option value={d} selected={d === data.domain}>{d}</option>
						{/each}
					</select>
				</div>
				{#if !data.isModuleDomain}
					<div class="flex flex-col gap-1.5">
						<label class="rf-label" for="f-selector">Sélecteur DKIM (optionnel)</label>
						<input
							id="f-selector"
							name="selector"
							value={data.selector ?? ''}
							autocomplete="off"
							class="rf-input font-mono md:w-56"
						/>
					</div>
				{/if}
				<Button type="submit" variant="secondary" class="max-md:w-full">Afficher</Button>
			</form>
		{:else}
			<p class="text-ink-dim">
				Aucun domaine à vérifier : créez un profil d'envoi ou configurez le module d'envoi.
			</p>
		{/if}
	</Panel>

	{#if data.domain}
		<Panel>
			{#snippet header()}
				<h2 class="rf-title font-mono [overflow-wrap:anywhere]">{data.domain}</h2>
				<form method="POST" action="?/recheck" use:enhance>
					<input type="hidden" name="domain" value={data.domain} />
					<input type="hidden" name="selector" value={data.selector ?? ''} />
					<Button type="submit" variant="secondary" size="sm">Relancer les vérifications</Button>
				</form>
			{/snippet}
			<ul class="grid gap-4 lg:grid-cols-2">
				{#each data.checks as c (c.id)}
					<li
						class="flex min-w-0 flex-col gap-2 rounded-card border border-line bg-surface-2 p-4"
						data-check={c.id}
					>
						<div class="flex flex-wrap items-center justify-between gap-2">
							<span class="font-medium text-ink">{titles[c.id]}</span>
							<Plate variant={tone[c.status]}>{labels[c.status]}</Plate>
						</div>
						<p class="text-ink">{c.message}</p>
						{#if c.fix}<p class="text-ink-dim">{c.fix}</p>{/if}
						{#if c.record}
							<div
								class="flex flex-col gap-2 rounded-btn border border-line bg-surface-1 px-3 py-2"
							>
								<div class="flex items-start justify-between gap-3">
									<span class="flex min-w-0 flex-wrap gap-x-2 font-mono">
										<span class="text-ink-dim">{c.record.type}</span>
										<span class="[overflow-wrap:anywhere]">{c.record.name}</span>
									</span>
									<span class="shrink-0">
										<CopyButton value={c.record.name} what="le nom de l'enregistrement" />
									</span>
								</div>
								<div class="flex items-start justify-between gap-3">
									<span class="min-w-0 font-mono [overflow-wrap:anywhere]">{c.record.value}</span>
									<span class="shrink-0">
										<CopyButton value={c.record.value} what="la valeur de l'enregistrement" />
									</span>
								</div>
							</div>
						{/if}
					</li>
				{/each}
			</ul>
			{#if data.checkedAt}
				<p class="mt-4 rf-meta">
					Résultats mis en cache 5 minutes (vérifié à {new Date(data.checkedAt).toLocaleTimeString(
						'fr-CH'
					)}).
				</p>
			{/if}
		</Panel>
	{/if}

	<Panel>
		{#snippet header()}
			<h2 class="rf-title">Module d'envoi intégré : {stateLabel[data.module.state]}</h2>
		{/snippet}
		<div class="flex flex-col gap-4">
			{#if data.module.state !== 'running'}
				<p class="text-ink">
					Un serveur d'envoi optionnel, livré avec redfish, envoie directement sans filtre d'un
					tiers. Il exige que votre hébergeur autorise le port 25 sortant.
				</p>
				<div class="grid gap-4 lg:grid-cols-2">
					<div class="flex min-w-0 flex-col gap-2">
						<p class="text-ink-dim">Ajoutez ces valeurs à votre fichier .env :</p>
						<pre
							class="overflow-x-auto rounded-btn border border-line bg-surface-2 px-3 py-2 font-mono">{data
								.module.envBlock}</pre>
						<div>
							<CopyButton
								value={data.module.envBlock}
								what="le bloc .env"
								label="Copier le bloc .env"
							/>
						</div>
					</div>
					<div class="flex min-w-0 flex-col gap-2">
						<p class="text-ink-dim">Puis démarrez le module :</p>
						<pre
							class="overflow-x-auto rounded-btn border border-line bg-surface-2 px-3 py-2 font-mono">docker compose --profile mail up -d</pre>
						<div>
							<CopyButton
								value="docker compose --profile mail up -d"
								what="la commande"
								label="Copier la commande"
							/>
						</div>
					</div>
				</div>
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
</Page>
