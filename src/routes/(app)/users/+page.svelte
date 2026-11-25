<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button, ErrorNotice, Page, Panel, Plate } from '$lib/components/ui';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const roleLabel = (role: string) => (role === 'superadmin' ? 'Superadmin' : 'Opérateur');
	const summary = $derived(
		`${data.users.length} compte${data.users.length > 1 ? 's' : ''}. Réinitialisez la 2FA d'un compte dont la clé est perdue : les sessions du compte sont fermées et l'action est journalisée.`
	);
</script>

<Page title="Utilisateurs" description={summary}>
	{#if form?.error}
		<ErrorNotice title="Action impossible" message={form.error} />
	{/if}
	<Panel flush>
		<div class="hidden md:block">
			<table class="w-full text-left">
				<thead class="border-b border-line">
					<tr>
						<th class="rf-label px-4 py-2.5">E-mail</th>
						<th class="rf-label px-4 py-2.5">Rôle</th>
						<th class="rf-label px-4 py-2.5">Double authentification</th>
						<th class="rf-label px-4 py-2.5 text-right">Action</th>
					</tr>
				</thead>
				<tbody class="divide-y divide-line">
					{#each data.users as u (u.id)}
						<tr>
							<td class="px-4 py-3 [overflow-wrap:anywhere] text-ink">{u.email}</td>
							<td class="px-4 py-3">{roleLabel(u.role)}</td>
							<td class="px-4 py-3">
								{#if u.totpEnabled}
									<Plate variant="signal">Active</Plate>
								{:else}
									<Plate variant="neutral">Inactive</Plate>
								{/if}
							</td>
							<td class="px-4 py-3 text-right">
								{#if u.totpEnabled}
									<form method="POST" action="?/reset2fa" use:enhance>
										<input type="hidden" name="userId" value={u.id} />
										<Button type="submit" size="sm">Réinitialiser la 2FA</Button>
									</form>
								{:else}
									<span class="text-ink-dim">—</span>
								{/if}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
		<ul class="divide-y divide-line md:hidden">
			{#each data.users as u (u.id)}
				<li class="flex flex-col gap-2 px-4 py-3">
					<span class="[overflow-wrap:anywhere] text-ink">{u.email}</span>
					<span class="flex flex-wrap items-center gap-2">
						<span class="rf-meta">{roleLabel(u.role)}</span>
						{#if u.totpEnabled}
							<Plate variant="signal">2FA active</Plate>
						{:else}
							<Plate variant="neutral">2FA inactive</Plate>
						{/if}
					</span>
					{#if u.totpEnabled}
						<form method="POST" action="?/reset2fa" use:enhance>
							<input type="hidden" name="userId" value={u.id} />
							<Button type="submit" size="sm" class="w-full">Réinitialiser la 2FA</Button>
						</form>
					{/if}
				</li>
			{/each}
		</ul>
	</Panel>
</Page>
