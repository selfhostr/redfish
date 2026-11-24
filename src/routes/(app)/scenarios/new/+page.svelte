<script lang="ts">
	import ScenarioForm from '$lib/components/scenarios/ScenarioForm.svelte';
	import { Button } from '$lib/components/ui';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

<main class="mx-auto flex max-w-[96rem] flex-col gap-6 px-4 py-6 md:px-6 md:py-8">
	<div class="flex flex-wrap items-center justify-between gap-3">
		<h1 class="text-2xl font-semibold text-ink">Créer un scénario</h1>
		<Button href="/scenarios" variant="ghost">Retour</Button>
	</div>

	<p class="max-w-4xl text-ink-dim">
		Composez un scénario. Les gabarits sont pré-remplis avec des squelettes neutres : adaptez le
		texte, puis enregistrez. L'aperçu se met à jour pendant la saisie ; le contenu est validé
		(notamment l'invariant « zéro capture » de la page) avant d'être stocké.
	</p>

	<ScenarioForm initial={data.defaults} {form} submitLabel="Créer le scénario" />
</main>
