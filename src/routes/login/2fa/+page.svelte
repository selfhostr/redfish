<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button, Field, ErrorNotice } from '$lib/components/ui';
	import type { ActionData } from './$types';

	let { form }: { form: ActionData } = $props();
</script>

<svelte:head>
	<title>Double authentification – redfish</title>
</svelte:head>

<main class="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-4 py-8 sm:p-8">
	<div>
		<h1 class="rf-page-title">Double authentification</h1>
		<p class="mt-1 text-ink-dim">
			Saisissez le code à 6 chiffres de votre application d'authentification, ou un code de secours.
		</p>
	</div>
	<form method="POST" use:enhance class="flex flex-col gap-4">
		<Field
			label="Code"
			name="code"
			autocomplete="one-time-code"
			inputmode="numeric"
			autofocus
			required
		/>
		{#if form?.error}
			<ErrorNotice title="Vérification impossible" message={form.error} />
		{/if}
		<Button type="submit" variant="primary">Vérifier</Button>
	</form>
	<a href="/login" class="text-ink-dim underline">Revenir à la connexion</a>
</main>
