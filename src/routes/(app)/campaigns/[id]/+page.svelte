<script lang="ts">
	import { DATETIME_MAX, DATETIME_MIN } from '$lib/datetime-bounds';
	import { enhance } from '$app/forms';
	import PreflightPanel from '$lib/components/campaigns/PreflightPanel.svelte';
	import SendingPaceFields from '$lib/components/campaigns/SendingPaceFields.svelte';
	import StatusPill from '$lib/components/StatusPill.svelte';
	import {
		Button,
		CopyButton,
		ErrorNotice,
		Field,
		LocalTime,
		Panel,
		Plate
	} from '$lib/components/ui';
	import { funnelLabels } from '$lib/funnel-labels';
	import { categoryLabel, difficultyLabel, localeLabel } from '$lib/scenario-labels';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	let showDelete = $state(false);
	let showComplete = $state(false);
	let confirmName = $state('');
	const nameMatches = $derived(confirmName.trim() === data.campaign.name);

	const funnelRows = $derived([
		{ label: funnelLabels.recipients, raw: data.funnel.recipients, human: null },
		{ label: funnelLabels.sent, raw: data.funnel.sent, human: null },
		{ label: funnelLabels.opened, raw: data.funnel.opened, human: data.funnel.human.opened },
		{ label: funnelLabels.clicked, raw: data.funnel.clicked, human: data.funnel.human.clicked },
		{
			label: funnelLabels.pageInteraction,
			raw: data.funnel.pageInteraction,
			human: data.funnel.human.pageInteraction
		},
		{
			label: funnelLabels.formSubmitted,
			raw: data.funnel.formSubmitted,
			human: data.funnel.human.formSubmitted
		},
		{
			label: funnelLabels.awarenessViewed,
			raw: data.funnel.awarenessViewed,
			human: data.funnel.human.awarenessViewed
		},
		{ label: funnelLabels.reported, raw: data.funnel.reported, human: data.funnel.human.reported }
	]);
</script>

<main class="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-6 md:px-6 md:py-8">
	<div class="flex flex-wrap items-start justify-between gap-3">
		<div class="flex min-w-0 max-w-full flex-col gap-1.5">
			<div class="flex flex-wrap items-center gap-x-3 gap-y-1.5">
				<h1 class="min-w-0 text-2xl font-semibold tracking-tight break-words text-ink">
					{data.campaign.name}
				</h1>
				<StatusPill status={data.campaign.status} />
			</div>
			{#if data.campaign.scheduledAt}
				<p class="text-ink-dim">
					Programmée : <LocalTime value={data.campaign.scheduledAt} timeZone={data.timezone} />
				</p>
			{/if}
			<p class="flex flex-wrap items-center gap-2 text-ink-dim">
				<span>Identifiant</span>
				<code class="font-mono text-xs break-all text-ink">{data.campaign.id}</code>
				<CopyButton value={data.campaign.id} what="l'identifiant de la campagne" />
			</p>
		</div>
		<div class="flex gap-3 max-md:w-full max-md:[&>*]:flex-1">
			<Button variant="secondary" href={`/campaigns/${data.campaign.id}/report`}>Rapport</Button>
			<Button
				variant="secondary"
				href={`/campaigns/${data.campaign.id}/export`}
				data-sveltekit-reload
			>
				Export CSV
			</Button>
			<Button variant="ghost" href="/campaigns">Campagnes</Button>
		</div>
	</div>

	{#if form?.error}
		<ErrorNotice message={form.error} />
	{/if}

	<Panel>
		{#snippet header()}
			<h2 class="rf-eyebrow">Scénario</h2>
		{/snippet}
		<div class="flex flex-col gap-3">
			<p class="text-ink-dim">Le scénario de sensibilisation utilisé par cette campagne.</p>
			{#if data.scenario}
				<dl class="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 md:gap-x-6">
					<dt class="text-ink-dim">Titre</dt>
					<dd class="min-w-0 break-words text-ink">{data.scenario.title}</dd>
					<dt class="text-ink-dim">Clé</dt>
					<dd class="flex min-w-0 flex-wrap items-center gap-2">
						<code class="font-mono text-xs break-all text-ink">{data.scenario.key}</code>
						<CopyButton value={data.scenario.key} what="la clé du scénario" />
					</dd>
					<dt class="text-ink-dim">Catégorie</dt>
					<dd class="text-ink">{categoryLabel(data.scenario.category)}</dd>
					<dt class="text-ink-dim">Difficulté</dt>
					<dd class="text-ink">{difficultyLabel(data.scenario.difficulty)}</dd>
					<dt class="text-ink-dim">Langue</dt>
					<dd class="text-ink">{localeLabel(data.scenario.locale)}</dd>
					<dt class="text-ink-dim">Étiquettes</dt>
					<dd class="min-w-0 break-words text-ink">
						{#if data.scenario.tags.length > 0}
							{data.scenario.tags.join(', ')}
						{:else}
							n/d
						{/if}
					</dd>
					<dt class="text-ink-dim">État</dt>
					<dd>
						<Plate variant={data.scenario.enabled ? 'signal' : 'neutral'}>
							{data.scenario.enabled ? 'Activé' : 'Désactivé'}
						</Plate>
					</dd>
				</dl>
				<div>
					<Button
						variant="secondary"
						size="sm"
						href={`/scenarios/${encodeURIComponent(data.scenario.key)}`}
					>
						Voir l'aperçu
					</Button>
				</div>
			{:else}
				<ErrorNotice
					title="Scénario introuvable"
					message="Le scénario associé à cette campagne n'existe plus."
				/>
			{/if}
		</div>
	</Panel>

	<Panel>
		{#snippet header()}
			<h2 class="rf-eyebrow">Autorisations</h2>
		{/snippet}
		<div class="flex flex-col gap-4">
			<p class="text-ink-dim">
				Autorisations écrites couvrant cette campagne. Au moins une doit être valide pour envoyer.
			</p>
			<ul class="flex flex-col gap-2">
				{#each data.authorizations as a (a.id)}
					<li class="rounded-md border border-line bg-surface-2 px-3 py-2 break-words text-ink">
						<span class="font-medium">{a.reference}</span>, {a.approvedBy}
						<span class="text-ink-dim">
							(<LocalTime value={a.validFrom} timeZone={data.timezone} /> → <LocalTime
								value={a.validUntil}
								timeZone={data.timezone}
							/>)
						</span>
					</li>
				{:else}
					<li class="text-ink-dim">Aucune autorisation.</li>
				{/each}
			</ul>
			<form method="POST" action="?/authorize" use:enhance class="grid gap-3 sm:grid-cols-2">
				<Field label="Référence" name="reference" required />
				<Field label="Approuvé par" name="approvedBy" required />
				<Field label={`Valide du (${data.timezone})`} id="field-validFrom">
					{#snippet input()}
						<input
							id="field-validFrom"
							name="validFrom"
							type="datetime-local"
							min={DATETIME_MIN}
							max={DATETIME_MAX}
							required
							class="rf-input w-full max-w-full min-w-0"
						/>
					{/snippet}
				</Field>
				<Field label={`Jusqu'au (${data.timezone})`} id="field-validUntil">
					{#snippet input()}
						<input
							id="field-validUntil"
							name="validUntil"
							type="datetime-local"
							min={DATETIME_MIN}
							max={DATETIME_MAX}
							required
							class="rf-input w-full max-w-full min-w-0"
						/>
					{/snippet}
				</Field>
				<Button type="submit" variant="secondary" class="max-md:w-full sm:self-start">
					Ajouter l'autorisation
				</Button>
			</form>
		</div>
	</Panel>

	{#if data.campaign.status === 'draft' || data.campaign.status === 'scheduled'}
		<Panel>
			{#snippet header()}
				<h2 class="rf-eyebrow">Envoi</h2>
			{/snippet}
			<div class="flex flex-col gap-4">
				<p class="text-ink-dim">Programmez l'envoi ou lancez la campagne immédiatement.</p>
				{#if data.preflight}
					<PreflightPanel report={data.preflight} />
				{/if}
				{#if data.campaign.launchError}
					<ErrorNotice
						title="Lancement programmé annulé"
						message={`${data.campaign.launchError} Corrigez le problème, puis reprogrammez ou lancez la campagne.`}
					/>
				{/if}
				{#if !data.canSend.ok}
					<ErrorNotice title="Envoi bloqué" message={data.canSend.reason} />
				{/if}

				<form
					method="POST"
					action="?/pace"
					use:enhance={() =>
						({ update }) =>
							update({ reset: false })}
					class="flex flex-col gap-3"
				>
					<SendingPaceFields
						spreadHours={data.campaign.spreadHours}
						workingHoursOnly={data.campaign.workingHoursOnly}
						workStartHour={data.campaign.workStartHour}
						workEndHour={data.campaign.workEndHour}
						timezone={data.timezone}
					/>
					<Button type="submit" variant="secondary" size="sm" class="max-md:w-full sm:self-start">
						Enregistrer le rythme d'envoi
					</Button>
				</form>

				{#if data.campaign.status === 'draft'}
					<form
						method="POST"
						action="?/schedule"
						use:enhance
						class="flex flex-col gap-3 sm:flex-row sm:items-end"
					>
						<Field label={`Date d'envoi (${data.timezone})`} id="field-scheduledAt" class="grow">
							{#snippet input()}
								<input
									id="field-scheduledAt"
									name="scheduledAt"
									type="datetime-local"
									min={DATETIME_MIN}
									max={DATETIME_MAX}
									required
									class="rf-input w-full max-w-full min-w-0"
								/>
							{/snippet}
						</Field>
						<Button
							type="submit"
							variant="secondary"
							disabled={!data.canSend.ok}
							class="max-md:w-full"
						>
							Programmer l'envoi
						</Button>
					</form>
				{/if}

				<form
					method="POST"
					action="?/launch"
					use:enhance={({ cancel }) => {
						if (!confirm('Lancer la campagne ? Des e-mails RÉELS seront envoyés aux cibles.'))
							cancel();
					}}
				>
					<Button
						type="submit"
						variant="primary"
						disabled={!data.canSend.ok || data.preflight?.ok === false}
						class="max-md:w-full"
					>
						Lancer maintenant
					</Button>
				</form>
			</div>
		</Panel>
	{/if}

	{#if data.progress}
		<Panel>
			{#snippet header()}
				<h2 class="rf-eyebrow">Avancement de l'envoi</h2>
			{/snippet}
			<dl class="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 md:gap-x-6">
				<dt class="text-ink-dim">Envoyés</dt>
				<dd class="text-ink">{data.progress.sent} / {data.progress.planned}</dd>
				{#if data.campaign.spreadHours}
					<dt class="text-ink-dim">Étalement</dt>
					<dd class="text-ink">
						{data.campaign.spreadHours % 24 === 0
							? `${data.campaign.spreadHours / 24} jour(s)`
							: `${data.campaign.spreadHours} heure(s)`}{data.campaign.workingHoursOnly
							? `, heures ouvrées ${data.campaign.workStartHour} h à ${data.campaign.workEndHour} h (lundi à vendredi)`
							: ''}
					</dd>
				{/if}
				<dt class="text-ink-dim">Prochain envoi</dt>
				<dd class="text-ink">
					{#if data.progress.nextAt}
						<LocalTime value={data.progress.nextAt} timeZone={data.timezone} />
					{:else}
						Aucun envoi en attente
					{/if}
				</dd>
				{#if data.progress.endAt}
					<dt class="text-ink-dim">Fin de la fenêtre d'envoi</dt>
					<dd class="text-ink">
						<LocalTime value={data.progress.endAt} timeZone={data.timezone} />
					</dd>
				{/if}
			</dl>
			{#if data.campaign.status === 'sending'}
				<form
					method="POST"
					action="?/pause"
					use:enhance={({ cancel }) => {
						if (
							!confirm(
								'Mettre la campagne en pause ? Les envois encore en attente sont suspendus ; vous pourrez modifier quelques réglages puis reprendre.'
							)
						)
							cancel();
					}}
					class="mt-4"
				>
					<Button type="submit" variant="secondary" class="max-md:w-full">Mettre en pause</Button>
				</form>
			{/if}
		</Panel>
	{/if}

	{#if data.campaign.status === 'paused'}
		<Panel>
			{#snippet header()}
				<h2 class="rf-eyebrow">Campagne en pause</h2>
			{/snippet}
			<div class="flex flex-col gap-5">
				<p class="text-ink-dim">
					Les envois sont suspendus. Vous pouvez ajuster le domaine de tracking, le message de
					sensibilisation et le rythme d'envoi, puis reprendre. À la reprise, les destinataires
					encore en attente sont replanifiés à partir de maintenant.
				</p>

				<form method="POST" action="?/edit" use:enhance class="flex flex-col gap-4">
					<Field
						label="Domaine de tracking"
						name="trackingDomain"
						value={data.campaign.trackingDomain}
						required
						help={`Seuls les destinataires pas encore envoyés utiliseront ce domaine.${
							data.progress && data.progress.sent > 0
								? ` ${data.progress.sent} destinataire(s) déjà envoyé(s) garderont l'ancien domaine.`
								: ''
						}`}
					/>
					<Field label="Message de sensibilisation (optionnel)" id="field-awarenessMessage">
						{#snippet input()}
							<textarea
								id="field-awarenessMessage"
								name="awarenessMessage"
								rows="3"
								class="rf-input w-full max-w-full min-w-0"
								>{data.campaign.awarenessMessage ?? ''}</textarea
							>
						{/snippet}
					</Field>
					<SendingPaceFields
						spreadHours={data.campaign.spreadHours}
						workingHoursOnly={data.campaign.workingHoursOnly}
						workStartHour={data.campaign.workStartHour}
						workEndHour={data.campaign.workEndHour}
						timezone={data.timezone}
					/>
					<Button type="submit" variant="secondary" class="max-md:w-full sm:self-start">
						Enregistrer les modifications
					</Button>
				</form>

				<form
					method="POST"
					action="?/resume"
					use:enhance={({ cancel }) => {
						if (!confirm('Reprendre la campagne ? Les envois en attente repartent dès maintenant.'))
							cancel();
					}}
				>
					<Button type="submit" variant="primary" class="max-md:w-full">Reprendre l'envoi</Button>
				</form>
			</div>
		</Panel>
	{/if}

	<Panel flush>
		{#snippet header()}
			<h2 class="rf-eyebrow">Entonnoir</h2>
		{/snippet}
		<p class="px-4 pt-4 text-ink-dim">
			Progression des destinataires, en valeurs brutes et en interactions probablement humaines. Les
			taux se calculent sur les envois réussis.
		</p>
		<div class="overflow-x-auto">
			<table class="mt-3 w-full text-left text-sm">
				<thead class="border-y border-line bg-surface-2">
					<tr>
						<th class="rf-label px-4 py-3 font-medium">Étape</th>
						<th class="rf-label px-4 py-3 text-right font-medium">Brut</th>
						<th class="rf-label px-4 py-3 text-right font-medium">Humain probable</th>
					</tr>
				</thead>
				<tbody class="divide-y divide-line">
					{#each funnelRows as row (row.label)}
						<tr>
							<td class="px-4 py-3 text-ink">{row.label}</td>
							<td class="px-4 py-3 text-right text-ink">{row.raw}</td>
							<td class="px-4 py-3 text-right text-ink-dim">
								{row.human === null ? 'n/d' : row.human}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</Panel>

	{#if data.retryingRecipients.length > 0}
		<Panel flush>
			{#snippet header()}
				<h2 class="rf-eyebrow">{data.retryingRecipients.length} envois en cours de réessai</h2>
			{/snippet}
			<p class="px-4 pt-4 text-ink-dim">
				L'envoi à ces destinataires a échoué ; il est réessayé automatiquement (jusqu'à {data.maxAttempts}
				tentatives). Vous n'avez rien à faire pour l'instant.
			</p>
			<div class="overflow-x-auto">
				<table class="mt-3 w-full text-left text-sm">
					<thead class="border-y border-line bg-surface-2">
						<tr>
							<th class="rf-label px-4 py-3 font-medium">Destinataire</th>
							<th class="rf-label px-4 py-3 font-medium">Dernier motif</th>
							<th class="rf-label px-4 py-3 font-medium">Tentatives</th>
						</tr>
					</thead>
					<tbody class="divide-y divide-line">
						{#each data.retryingRecipients as r (r.id)}
							<tr>
								<td class="px-4 py-3 text-ink">{r.name ? `${r.name} · ` : ''}{r.email}</td>
								<td class="px-4 py-3 break-words text-ink-dim">{r.reason}</td>
								<td class="px-4 py-3 text-ink-dim">
									{r.attempts === null
										? 'réessai en cours'
										: `${r.attempts} / ${data.maxAttempts}, réessai en cours`}
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</Panel>
	{/if}

	{#if data.funnel.failed > 0}
		<Panel flush>
			{#snippet header()}
				<h2 class="rf-eyebrow">{data.funnel.failed} envois en échec</h2>
			{/snippet}
			<p class="px-4 pt-4 text-ink-dim">
				Ces destinataires n'ont pas reçu l'e-mail ; ils sont exclus des taux (calculés sur les
				envois réussis).
			</p>
			<div class="overflow-x-auto">
				<table class="mt-3 w-full text-left text-sm">
					<thead class="border-y border-line bg-surface-2">
						<tr>
							<th class="rf-label px-4 py-3 font-medium">Destinataire</th>
							<th class="rf-label px-4 py-3 font-medium">Motif</th>
						</tr>
					</thead>
					<tbody class="divide-y divide-line">
						{#each data.failedRecipients as r (r.id)}
							<tr>
								<td class="px-4 py-3 text-ink">{r.name ? `${r.name} · ` : ''}{r.email}</td>
								<td class="px-4 py-3 break-words text-ink-dim">{r.reason}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
			{#if data.campaign.status === 'sending'}
				<form method="POST" action="?/retryFailed" use:enhance class="p-4">
					<Button type="submit" variant="secondary">Réessayer les envois en échec</Button>
				</form>
			{/if}
		</Panel>
	{/if}

	{#if data.campaign.status !== 'completed'}
		<Panel>
			{#snippet header()}
				<h2 class="rf-eyebrow">Signalements manuels</h2>
			{/snippet}
			<form method="POST" action="?/report" use:enhance class="flex flex-col gap-3">
				<p class="text-ink-dim">
					Collez les adresses e-mail (une par ligne) des personnes qui ont signalé ce message à leur
					service informatique, par exemple en le transmettant à une boîte de sécurité.
				</p>
				<Field label="Adresses e-mail" id="field-reportEmails">
					{#snippet input()}
						<textarea
							id="field-reportEmails"
							name="emails"
							rows="5"
							required
							class="rf-input w-full max-w-full min-w-0"></textarea>
					{/snippet}
				</Field>
				<Button type="submit" variant="secondary" class="max-md:w-full sm:self-start">
					Enregistrer les signalements
				</Button>
				{#if form && 'reported' in form && form.reported}
					<p class="text-ink" role="status">
						{form.reported.matched} signalement(s) enregistré(s).
						{#if form.reported.unmatched.length > 0}
							Adresses sans correspondance dans cette campagne :
							{form.reported.unmatched.join(', ')}.
						{/if}
					</p>
				{/if}
			</form>
		</Panel>
	{/if}

	{#if data.campaign.status === 'sending'}
		<Panel>
			{#snippet header()}
				<h2 class="rf-eyebrow">Clôture</h2>
			{/snippet}
			<div class="flex flex-col gap-4">
				<p class="text-ink-dim">
					La campagne est clôturée automatiquement une fois les envois terminés et la période
					d'observation écoulée (comptée depuis le dernier envoi planifié). Clôturer maintenant
					annule les envois encore planifiés et fige les statistiques : les événements suivants ne
					sont plus enregistrés. Cette action est irréversible.
				</p>
				{#if !showComplete}
					<div>
						<Button variant="secondary" class="max-md:w-full" onclick={() => (showComplete = true)}>
							Clôturer la campagne
						</Button>
					</div>
				{:else}
					<form method="POST" action="?/complete" use:enhance class="flex gap-3 max-md:flex-col">
						<Button type="submit" class="max-md:w-full">Confirmer la clôture</Button>
						<Button variant="ghost" class="max-md:w-full" onclick={() => (showComplete = false)}>
							Annuler
						</Button>
					</form>
				{/if}
			</div>
		</Panel>
	{/if}

	<Panel>
		{#snippet header()}
			<h2 class="rf-eyebrow">Zone de danger</h2>
		{/snippet}
		<div class="flex flex-col gap-4">
			{#if data.campaign.status === 'sending'}
				<p class="text-ink-dim">
					La suppression est indisponible pendant l'envoi. Attendez la fin de l'envoi avant de
					supprimer cette campagne.
				</p>
			{:else}
				<p class="text-ink-dim">
					Supprimer définitivement cette campagne efface ses destinataires, ses événements de suivi
					et ses autorisations. Cette action est irréversible.
				</p>
				{#if !showDelete}
					<div>
						<Button variant="danger" class="max-md:w-full" onclick={() => (showDelete = true)}>
							Supprimer la campagne
						</Button>
					</div>
				{:else}
					<form method="POST" action="?/delete" use:enhance class="flex flex-col gap-3">
						<Field
							label="Confirmez en saisissant le nom de la campagne"
							name="confirm"
							bind:value={confirmName}
							autocomplete="off"
							help={`Saisissez exactement : ${data.campaign.name}`}
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
			{/if}
		</div>
	</Panel>
</main>
