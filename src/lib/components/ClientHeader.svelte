<script lang="ts">
	import { page } from '$app/state';
	import { appPathname } from '$lib/base-path';

	// En-tête de la fiche du client actif : nom, langue et onglets de navigation
	// (liens) vers sa vue d'ensemble, ses listes et ses profils d'envoi.
	const tenant = $derived(
		page.data.activeTenant as { id: string; name: string; locale: string } | null
	);
	const path = $derived(appPathname(page.url));

	const tabs = $derived(
		tenant
			? [
					{
						href: `/tenants/${tenant.id}`,
						label: "Vue d'ensemble",
						on: path === `/tenants/${tenant.id}`
					},
					{ href: '/lists', label: 'Listes', on: path === '/lists' || path.startsWith('/lists/') },
					{
						href: '/sending-profiles',
						label: "Profils d'envoi",
						on: path === '/sending-profiles'
					},
					{
						href: '/privacy',
						label: 'Données personnelles',
						on: path === '/privacy' || path.startsWith('/privacy/')
					}
				]
			: []
	);
</script>

{#if tenant}
	<header class="flex flex-col gap-3">
		<div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
			<h1 class="min-w-0 text-2xl font-semibold tracking-tight [overflow-wrap:anywhere] text-ink">
				{tenant.name}
			</h1>
			<span class="font-mono text-xs text-ink-dim uppercase">{tenant.locale}</span>
		</div>
		<nav aria-label="Fiche du client" class="tabs">
			{#each tabs as t (t.href)}
				<a href={t.href} class="tab" class:active={t.on} aria-current={t.on ? 'page' : undefined}>
					{t.label}
				</a>
			{/each}
		</nav>
	</header>
{/if}

<style>
	.tabs {
		display: flex;
		gap: 0.25rem;
		max-width: 100%;
		overflow-x: auto;
		border-bottom: 1px solid var(--c-line);
		scrollbar-width: none;
	}
	.tabs::-webkit-scrollbar {
		display: none;
	}
	.tab {
		flex: none;
		white-space: nowrap;
		display: inline-flex;
		align-items: center;
		min-height: 44px;
		padding: 0.5rem 0.75rem;
		margin-bottom: -1px;
		border-bottom: 2px solid transparent;
		color: var(--c-ink-dim);
		font-size: 0.8125rem;
		font-weight: 500;
		text-decoration: none;
		transition:
			color 0.12s ease,
			border-color 0.12s ease;
	}
	.tab:hover {
		color: var(--c-ink);
	}
	.tab.active {
		color: var(--c-ink);
		border-bottom-color: var(--c-ink);
	}
	@media (min-width: 768px) {
		.tab {
			min-height: 0;
		}
	}
</style>
