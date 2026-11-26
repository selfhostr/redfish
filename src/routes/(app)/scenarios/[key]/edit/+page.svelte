<script lang="ts">
	import ScenarioForm from '$lib/components/scenarios/ScenarioForm.svelte';
	import { Button, Page } from '$lib/components/ui';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const backHref = $derived(`/scenarios/${encodeURIComponent(data.values.key)}`);
</script>

<Page
	title="Modifier un scénario"
	description="Modifiez le scénario ; la clé ne peut pas changer. Les envois pas encore partis des campagnes en cours utilisent la nouvelle version, les rapports déjà constitués ne changent pas."
>
	{#snippet actions()}
		<Button href={backHref} variant="ghost">Retour</Button>
	{/snippet}

	<ScenarioForm
		initial={data.values}
		{form}
		submitLabel="Enregistrer les modifications"
		keyReadonly
		cancelHref={backHref}
	/>
</Page>
