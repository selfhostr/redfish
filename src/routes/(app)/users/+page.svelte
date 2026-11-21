<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button, ErrorNotice, Panel } from '$lib/components/ui';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

<main class="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-6 md:px-6 md:py-8">
	<div>
		<h1 class="text-lg font-semibold tracking-tight text-ink">Utilisateurs</h1>
		<p class="text-ink-dim">
			Réinitialiser la double authentification d'un compte (clé perdue ou illisible). La
			réinitialisation est journalisée et ferme les sessions du compte.
		</p>
	</div>
	{#if form?.error}
		<ErrorNotice title="Action impossible" message={form.error} />
	{/if}
	<Panel>
		<ul class="flex flex-col divide-y divide-line">
			{#each data.users as u (u.id)}
				<li class="flex items-center justify-between gap-3 py-2">
					<span>{u.email} <span class="text-ink-dim">({u.role})</span></span>
					{#if u.totpEnabled}
						<form method="POST" action="?/reset2fa" use:enhance>
							<input type="hidden" name="userId" value={u.id} />
							<Button type="submit">Réinitialiser la 2FA</Button>
						</form>
					{:else}
						<span class="text-ink-dim">2FA inactive</span>
					{/if}
				</li>
			{/each}
		</ul>
	</Panel>
</main>
