<script lang="ts">
	import ScenarioForm from '$lib/components/scenarios/ScenarioForm.svelte';
	import { Button, Page } from '$lib/components/ui';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

<Page
	title="Créer un scénario"
	description="Composez un scénario à partir de gabarits neutres ; l'aperçu se met à jour pendant la saisie."
>
	{#snippet actions()}
		<Button href="/scenarios" variant="ghost">Retour</Button>
	{/snippet}

	<ScenarioForm initial={data.defaults} {form} submitLabel="Créer le scénario" />
</Page>
