<script lang="ts">
	import { enhance } from '$app/forms';
	import Logo from '$lib/components/shell/Logo.svelte';
	import { Button, Field, ErrorNotice } from '$lib/components/ui';
	import type { ActionData } from './$types';

	let { form }: { form: ActionData } = $props();
</script>

<svelte:head>
	<title>Connexion – redfish</title>
</svelte:head>

<main class="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-4 py-8 sm:p-8">
	<div>
		<div class="mb-3"><Logo size={40} withName={false} /></div>
		<h1 class="rf-page-title">redfish</h1>
		<p class="mt-1 text-ink-dim">Connectez-vous avec votre e-mail et votre mot de passe.</p>
	</div>
	<form method="POST" use:enhance class="flex flex-col gap-4">
		<Field label="E-mail" name="email" type="email" autocomplete="username" required />
		<Field
			label="Mot de passe"
			name="password"
			type="password"
			autocomplete="current-password"
			required
		/>
		{#if form?.error}
			<ErrorNotice title="Connexion impossible" message={form.error} />
		{/if}
		<Button type="submit" variant="primary">Se connecter</Button>
	</form>
</main>
