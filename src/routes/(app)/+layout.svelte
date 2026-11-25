<script lang="ts">
	import { page, navigating } from '$app/state';
	import { afterNavigate } from '$app/navigation';
	import { onMount, tick } from 'svelte';
	import Skeleton from '$lib/components/ui/Skeleton.svelte';
	import Toast from '$lib/components/ui/Toast.svelte';
	import Icon from '$lib/components/shell/Icon.svelte';
	import Logo from '$lib/components/shell/Logo.svelte';
	import Sidebar from '$lib/components/shell/Sidebar.svelte';
	import { crumbsFor, navSections, tabGroups, tabsFor } from '$lib/components/shell/nav';
	import { appPathname } from '$lib/base-path';
	let { data, children } = $props();

	const sections = $derived(
		navSections({ hasTenant: !!data.activeTenant, superadmin: data.user.role === 'superadmin' })
	);
	const path = $derived(appPathname(page.url));
	const crumbs = $derived(
		crumbsFor(path, sections, page.data as Record<string, unknown>, data.activeTenant?.name)
	);
	const here = $derived(crumbs.at(-1)?.label ?? '');
	const tabs = $derived(tabsFor(path, tabGroups({ superadmin: data.user.role === 'superadmin' })));

	// Squelette affiché seulement après un court délai (évite le clignotement) ;
	// la page reste montée pour ne pas perdre la saisie en cas d'échec.
	let showSkeleton = $state(false);
	$effect(() => {
		if (!navigating.to) {
			showSkeleton = false;
			return;
		}
		const t = setTimeout(() => (showSkeleton = true), 150);
		return () => clearTimeout(t);
	});

	// --- Barre latérale de bureau : dépliée (240 px) ou repliée en rail d'icônes (56 px). ---
	const STORE = 'rf-sidebar-collapsed';
	let collapsed = $state(false);
	let toggleHint = $state('Ctrl B');
	onMount(() => {
		try {
			collapsed = localStorage.getItem(STORE) === '1';
		} catch {
			/* stockage indisponible : barre dépliée */
		}
		if (/Mac|iPhone|iPad/.test(navigator.userAgent)) toggleHint = '⌘B';
	});
	function toggleSidebar() {
		collapsed = !collapsed;
		try {
			localStorage.setItem(STORE, collapsed ? '1' : '0');
		} catch {
			/* préférence non mémorisée */
		}
	}

	// --- Tiroir mobile (< 1024 px). ---
	let drawerOpen = $state(false);
	let menuBtn = $state<HTMLButtonElement>();
	let drawerEl = $state<HTMLElement>();

	afterNavigate(() => {
		drawerOpen = false;
	});

	$effect(() => {
		if (!drawerOpen) return;
		const prev = document.body.style.overflow;
		document.body.style.overflow = 'hidden';
		tick().then(() => drawerEl?.querySelector<HTMLElement>('a, button')?.focus());
		return () => {
			document.body.style.overflow = prev;
		};
	});

	const isTyping = (t: EventTarget | null) =>
		t instanceof HTMLElement &&
		(t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName));

	function onWindowKey(e: KeyboardEvent) {
		if (e.key === 'Escape' && drawerOpen) {
			drawerOpen = false;
			menuBtn?.focus();
			return;
		}
		// Ctrl B / ⌘B replie et déplie la barre latérale, comme dans les éditeurs.
		if (
			(e.ctrlKey || e.metaKey) &&
			!e.altKey &&
			!e.shiftKey &&
			e.key.toLowerCase() === 'b' &&
			!isTyping(e.target) &&
			window.matchMedia('(min-width: 1024px)').matches
		) {
			e.preventDefault();
			toggleSidebar();
		}
	}
</script>

<svelte:window onkeydown={onWindowKey} />

<svelte:head>
	<title>{here ? `${here} – redfish` : 'redfish'}</title>
</svelte:head>

<div class="shell" class:collapsed>
	<a class="skip" href="#main">Aller au contenu</a>

	<aside id="sidebar" class="side" aria-label="Barre latérale">
		<Sidebar
			variant={collapsed ? 'rail' : 'expanded'}
			{sections}
			{path}
			user={data.user}
			tenants={data.tenants}
			activeTenant={data.activeTenant}
			{toggleHint}
			onToggle={toggleSidebar}
		/>
	</aside>

	<div class="column">
		<!-- Téléphone et tablette : le tiroir, la marque, la page courante. -->
		<header class="mobilebar">
			<button
				type="button"
				class="bar-btn"
				bind:this={menuBtn}
				aria-expanded={drawerOpen}
				aria-controls="drawer"
				aria-label="Ouvrir la navigation"
				onclick={() => (drawerOpen = true)}
			>
				<Icon name="menu" size={20} />
			</button>
			<a href="/dashboard" class="bar-btn" aria-label="Tableau de bord">
				<Logo withName={false} />
			</a>
			<span class="here">{here}</span>
		</header>

		<!-- Bureau : où l'on se trouve. -->
		<header class="topbar">
			{#if crumbs.length}
				<nav aria-label="Fil d'Ariane" class="crumbs">
					<ol>
						{#each crumbs as c, i (i)}
							{#if i > 0}
								<li class="crumb-sep" aria-hidden="true"><Icon name="chevronRight" size={14} /></li>
							{/if}
							<li class="crumb" class:last={i === crumbs.length - 1}>
								{#if c.href}
									<a href={c.href}>{c.label}</a>
								{:else}
									<span aria-current={i === crumbs.length - 1 ? 'page' : undefined}>{c.label}</span>
								{/if}
							</li>
						{/each}
					</ol>
				</nav>
			{/if}
		</header>

		<div id="main" class="content" tabindex="-1">
			{#if tabs}
				<!-- Pages regroupées sous une même entrée : on passe de l'une à l'autre ici. -->
				<nav class="section-tabs" aria-label="Pages de la section">
					{#each tabs as t (t.href)}
						<a
							href={t.href}
							class="section-tab"
							class:current={t.href === path}
							aria-current={t.href === path ? 'page' : undefined}
						>
							{t.label}
						</a>
					{/each}
				</nav>
			{/if}
			{#if showSkeleton}
				<div class="nav-skeleton" role="status" aria-label="Chargement">
					<Skeleton height="2rem" width="40%" />
					<Skeleton height="8rem" />
					<Skeleton height="8rem" />
				</div>
			{/if}
			<div class="page-slot" class:hidden-busy={showSkeleton} aria-busy={showSkeleton}>
				{@render children()}
			</div>
		</div>
	</div>

	{#if drawerOpen}
		<div class="drawer-wrap">
			<button
				type="button"
				class="backdrop"
				tabindex="-1"
				aria-label="Fermer la navigation"
				onclick={() => (drawerOpen = false)}
			></button>
			<div
				class="drawer"
				id="drawer"
				bind:this={drawerEl}
				role="dialog"
				aria-modal="true"
				aria-label="Navigation"
			>
				<div class="drawer-head">
					<a href="/dashboard" class="drawer-brand"><Logo /></a>
					<button
						type="button"
						class="bar-btn"
						aria-label="Fermer la navigation"
						onclick={() => {
							drawerOpen = false;
							menuBtn?.focus();
						}}
					>
						<Icon name="x" size={20} />
					</button>
				</div>
				<Sidebar
					variant="drawer"
					{sections}
					{path}
					user={data.user}
					tenants={data.tenants}
					activeTenant={data.activeTenant}
				/>
			</div>
		</div>
	{/if}
	<Toast />
</div>

<style>
	.shell {
		min-height: 100dvh;
		background: var(--c-canvas);
		color: var(--c-ink);
	}

	.skip {
		position: fixed;
		top: 0.75rem;
		left: 0.75rem;
		z-index: 60;
		padding: 0.5rem 0.75rem;
		border-radius: var(--r-btn);
		background: var(--c-ink);
		color: var(--c-on-ink);
		font-weight: 600;
		text-decoration: none;
		transform: translateY(-200%);
	}
	.skip:focus-visible {
		transform: none;
	}

	/* --- Barre latérale de bureau ---------------------------------------------------- */
	.side {
		display: none;
	}
	.column {
		display: flex;
		flex-direction: column;
		min-width: 0;
		min-height: 100dvh;
	}

	@media (min-width: 1024px) {
		.shell {
			display: flex;
		}
		.side {
			display: block;
			position: sticky;
			top: 0;
			z-index: 30;
			flex: none;
			align-self: flex-start;
			width: 15rem;
			height: 100dvh;
			border-right: 1px solid var(--c-line);
			background: var(--c-canvas);
		}
		.collapsed .side {
			width: 3.5rem;
		}
		.column {
			flex: 1;
		}
	}
	@media (min-width: 1024px) and (prefers-reduced-motion: no-preference) {
		.side {
			transition: width 0.2s cubic-bezier(0.16, 1, 0.3, 1);
		}
	}

	/* --- Barres du haut ------------------------------------------------------------- */
	.mobilebar,
	.topbar {
		position: sticky;
		top: 0;
		z-index: 20;
		display: flex;
		align-items: center;
		height: 3.5rem;
		flex: none;
		border-bottom: 1px solid var(--c-line);
		background: var(--c-canvas);
	}
	.mobilebar {
		gap: 0.25rem;
		padding: 0 0.5rem;
		padding-left: max(0.5rem, env(safe-area-inset-left));
	}
	.topbar {
		display: none;
		gap: 1.5rem;
		padding: 0 2.5rem;
	}
	@media (min-width: 1024px) {
		.mobilebar {
			display: none;
		}
		.topbar {
			display: flex;
		}
	}

	.bar-btn {
		display: grid;
		place-items: center;
		width: 2.75rem;
		height: 2.75rem;
		flex: none;
		border: 0;
		border-radius: var(--r-btn);
		background: transparent;
		color: var(--c-ink);
		cursor: pointer;
	}
	.bar-btn:hover {
		background: var(--c-surface-2);
	}
	.here {
		min-width: 0;
		flex: 1;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		padding-left: 0.25rem;
		font-size: 0.875rem;
		font-weight: 500;
	}

	.crumbs {
		flex: 1;
		min-width: 0;
	}
	.crumbs ol {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		min-width: 0;
		margin: 0;
		padding: 0;
		list-style: none;
		font-size: 0.875rem;
	}
	.crumb {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		color: var(--c-ink-dim);
	}
	.crumb a {
		border-radius: 4px;
		text-decoration: none;
		transition: color 0.15s ease;
	}
	.crumb a:hover {
		color: var(--c-ink);
	}
	.crumb.last {
		color: var(--c-ink);
		font-weight: 500;
	}
	.crumb-sep {
		display: flex;
		flex: none;
		color: var(--c-ink-dim);
		opacity: 0.7;
	}

	/* --- Contenu --------------------------------------------------------------------- */
	.content {
		flex: 1;
		min-width: 0;
	}
	.content:focus {
		outline: none;
	}
	.section-tabs {
		display: flex;
		gap: 0.25rem;
		padding: 0 1rem;
		border-bottom: 1px solid var(--c-line);
		overflow-x: auto;
		scrollbar-width: none;
	}
	@media (min-width: 640px) {
		.section-tabs {
			padding: 0 1.5rem;
		}
	}
	@media (min-width: 1024px) {
		.section-tabs {
			padding: 0 2.5rem;
		}
	}
	.section-tab {
		display: inline-flex;
		align-items: center;
		flex: none;
		height: 2.75rem;
		padding: 0 0.75rem;
		margin-bottom: -1px;
		border-bottom: 2px solid transparent;
		color: var(--c-ink-dim);
		font-weight: 500;
		text-decoration: none;
		white-space: nowrap;
		transition:
			color 0.15s ease,
			border-color 0.15s ease;
	}
	.section-tab:first-child {
		margin-left: -0.75rem;
	}
	.section-tab:hover {
		color: var(--c-ink);
	}
	.section-tab.current {
		color: var(--c-ink);
		border-bottom-color: var(--c-ink);
	}
	.hidden-busy {
		display: none;
	}
	.nav-skeleton {
		max-width: 72rem;
		margin: 0 auto;
		padding: 1.5rem;
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	/* --- Tiroir mobile --------------------------------------------------------------- */
	.drawer-wrap {
		position: fixed;
		inset: 0;
		z-index: 50;
	}
	.backdrop {
		position: absolute;
		inset: 0;
		border: 0;
		padding: 0;
		background: rgb(0 0 0 / 0.6);
		cursor: default;
	}
	.drawer {
		position: absolute;
		inset: 0 auto 0 0;
		display: flex;
		flex-direction: column;
		width: min(18rem, 85vw);
		padding-left: env(safe-area-inset-left);
		background: var(--c-canvas);
		border-right: 1px solid var(--c-line-strong);
	}
	.drawer-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		height: 3.5rem;
		flex: none;
		padding: 0 0.5rem 0 1.25rem;
	}
	.drawer-brand {
		text-decoration: none;
	}
	.drawer > :global(.sidebar) {
		flex: 1;
		min-height: 0;
	}
	@media (prefers-reduced-motion: no-preference) {
		.drawer {
			animation: drawer-in 0.22s cubic-bezier(0.16, 1, 0.3, 1);
		}
		@keyframes drawer-in {
			from {
				transform: translateX(-100%);
			}
		}
	}
	@media (min-width: 1024px) {
		.drawer-wrap {
			display: none;
		}
	}
</style>
