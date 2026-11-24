<script lang="ts">
	import WebmailPreview from '$lib/components/preview/WebmailPreview.svelte';
	import { Button, CopyButton, Panel, Plate } from '$lib/components/ui';
	import { categoryLabel, difficultyLabel, localeLabel } from '$lib/scenario-labels';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const s = $derived(data.scenario);
</script>

<main class="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-6 md:px-6 md:py-8">
	<a href="/scenarios" class="text-ink-dim hover:text-ink">Retour aux scénarios</a>

	<div class="flex flex-wrap items-center justify-between gap-3">
		<h1 class="text-2xl font-semibold [overflow-wrap:anywhere] text-ink">{s.title}</h1>
		<Button href="/scenarios/{encodeURIComponent(s.key)}/export" download variant="secondary">
			Exporter
		</Button>
	</div>

	<p class="text-ink-dim">
		Fiche du scénario et parcours simulé tel que le vivrait un destinataire, de l'e-mail à la page
		de sensibilisation.
	</p>

	<Panel>
		<dl
			class="grid grid-cols-[max-content_minmax(0,1fr)] gap-x-4 gap-y-2 md:gap-x-6 [&_dd]:[overflow-wrap:anywhere]"
		>
			<dt class="text-ink-dim">Titre</dt>
			<dd class="text-ink">{s.title}</dd>
			<dt class="text-ink-dim">Clé</dt>
			<dd class="flex items-center gap-2">
				<span class="font-mono text-ink">{s.key}</span>
				<CopyButton value={s.key} what="la clé" />
			</dd>
			<dt class="text-ink-dim">Catégorie</dt>
			<dd class="text-ink">{categoryLabel(s.category)}</dd>
			<dt class="text-ink-dim">Difficulté</dt>
			<dd class="text-ink">{difficultyLabel(s.difficulty)}</dd>
			<dt class="text-ink-dim">Langue</dt>
			<dd class="text-ink">{localeLabel(s.locale)}</dd>
			<dt class="text-ink-dim">Tags</dt>
			<dd class="text-ink">{s.tags.length > 0 ? s.tags.join(', ') : 'n/d'}</dd>
			<dt class="text-ink-dim">État</dt>
			<dd>
				<Plate variant={s.enabled ? 'signal' : 'neutral'}>
					{s.enabled ? 'Activé' : 'Désactivé'}
				</Plate>
			</dd>
			<dt class="text-ink-dim">Sujet</dt>
			<dd class="text-ink">{data.preview.subject}</dd>
			<dt class="text-ink-dim">Expéditeur</dt>
			<dd class="text-ink">
				{data.preview.fromName}
				<span class="font-mono text-ink-dim">&lt;{data.preview.fromAddress}&gt;</span>
				<span class="mt-1 block text-xs text-ink-dim">
					Nom affiché de l'expéditeur pour ce scénario (ex. « Service informatique »). Laissé vide,
					c'est le nom du profil d'envoi qui s'applique. L'adresse e-mail provient toujours du
					profil d'envoi.
				</span>
			</dd>
		</dl>
	</Panel>

	<p class="text-ink-dim">
		L'aperçu ci-dessous est une maquette : le destinataire est fictif, aucune donnée n'est
		enregistrée, aucun formulaire n'est soumis et aucun appel réseau n'est effectué.
	</p>

	<WebmailPreview preview={data.preview} />
</main>
