<script lang="ts">
	import ScenarioForm from '$lib/components/scenarios/ScenarioForm.svelte';
	import { Button } from '$lib/components/ui';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const backHref = $derived(`/scenarios/${encodeURIComponent(data.values.key)}`);
</script>

<main class="mx-auto flex max-w-[96rem] flex-col gap-6 px-4 py-6 md:px-6 md:py-8">
	<div class="flex flex-wrap items-center justify-between gap-3">
		<h1 class="text-2xl font-semibold text-ink">Modifier un scénario</h1>
		<Button href={backHref} variant="ghost">Retour</Button>
	</div>

	<p class="max-w-4xl text-ink-dim">
		Reprenez le scénario dans le même formulaire que la création, pré-rempli avec son contenu
		actuel. La clé ne peut pas changer. L'aperçu se met à jour pendant la saisie ; le contenu est
		revalidé (notamment l'invariant « zéro capture » de la page) avant d'être enregistré.
	</p>

	<p class="text-xs text-ink-dim">
		Modifier ce scénario affecte les envois pas encore partis des campagnes en cours ; les rapports
		déjà constitués ne changent pas.
	</p>

	<ScenarioForm
		initial={data.values}
		{form}
		submitLabel="Enregistrer les modifications"
		keyReadonly
		cancelHref={backHref}
	/>
</main>
