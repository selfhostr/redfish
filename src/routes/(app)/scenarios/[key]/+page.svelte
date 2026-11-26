<script lang="ts">
	import WebmailPreview from '$lib/components/preview/WebmailPreview.svelte';
	import { Button, CopyButton, Page, Panel, Plate } from '$lib/components/ui';
	import { categoryLabel, difficultyLabel, localeLabel } from '$lib/scenario-labels';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const s = $derived(data.scenario);
	const canEdit = $derived(data.user.role === 'superadmin' && data.editable);
</script>

<Page
	title={s.title}
	description="Fiche du scénario et parcours simulé tel que le vivrait un destinataire, de l'e-mail à la page de sensibilisation."
>
	{#snippet actions()}
		<Button href="/scenarios/{encodeURIComponent(s.key)}/export" download variant="secondary">
			Exporter
		</Button>
		{#if canEdit}
			<Button href="/scenarios/{encodeURIComponent(s.key)}/edit" variant="primary">Modifier</Button>
		{/if}
	{/snippet}

	<Panel>
		{#snippet header()}
			<h2 class="rf-title">Fiche</h2>
		{/snippet}
		<dl
			class="grid grid-cols-[max-content_minmax(0,1fr)] items-baseline gap-x-6 gap-y-3 md:grid-cols-[max-content_minmax(0,1fr)_max-content_minmax(0,1fr)] [&_dd]:[overflow-wrap:anywhere]"
		>
			<dt class="rf-label">Titre</dt>
			<dd class="text-ink">{s.title}</dd>
			<dt class="rf-label">Clé</dt>
			<dd class="flex items-center gap-2">
				<span class="font-mono text-ink">{s.key}</span>
				<CopyButton value={s.key} what="la clé" />
			</dd>
			<dt class="rf-label">Catégorie</dt>
			<dd class="text-ink">{categoryLabel(s.category)}</dd>
			<dt class="rf-label">Difficulté</dt>
			<dd class="text-ink">{difficultyLabel(s.difficulty)}</dd>
			<dt class="rf-label">Langue</dt>
			<dd class="text-ink">{localeLabel(s.locale)}</dd>
			<dt class="rf-label">Tags</dt>
			<dd class="text-ink">{s.tags.length > 0 ? s.tags.join(', ') : '—'}</dd>
			<dt class="rf-label">État</dt>
			<dd>
				<Plate variant={s.enabled ? 'signal' : 'neutral'}>
					{s.enabled ? 'Activé' : 'Désactivé'}
				</Plate>
			</dd>
			<dt class="rf-label">Sujet</dt>
			<dd class="text-ink">{data.preview.subject}</dd>
			<dt class="rf-label">Expéditeur</dt>
			<dd class="text-ink md:col-span-3">
				{data.preview.fromName}
				<span class="font-mono text-ink-dim">&lt;{data.preview.fromAddress}&gt;</span>
				<span class="rf-meta mt-1 block">
					Nom affiché pour ce scénario ; laissé vide, c'est le nom du profil d'envoi. L'adresse
					vient toujours du profil d'envoi.
				</span>
			</dd>
		</dl>
	</Panel>

	<section class="flex flex-col gap-3" aria-label="Aperçu du parcours">
		<p class="rf-meta">
			Maquette : destinataire fictif, aucune donnée enregistrée, aucun formulaire soumis, aucun
			appel réseau.
		</p>
		<WebmailPreview preview={data.preview} />
	</section>
</Page>
