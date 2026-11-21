<script lang="ts">
	import { page, navigating } from '$app/state';
	import { afterNavigate } from '$app/navigation';
	import { tick } from 'svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Skeleton from '$lib/components/ui/Skeleton.svelte';
	import Toast from '$lib/components/ui/Toast.svelte';
	let { data, children } = $props();

	// Listes et profils d'envoi dépendent du client : visibles seulement s'il y en a un d'actif.
	const links = $derived([
		{ href: '/dashboard', label: 'Tableau de bord' },
		{ href: '/campaigns', label: 'Campagnes' },
		...(data.activeTenant
			? [
					{ href: '/lists', label: 'Listes' },
					{ href: '/sending-profiles', label: "Profils d'envoi" }
				]
			: []),
		{ href: '/tenants', label: 'Clients' },
		{ href: '/scenarios', label: 'Scénarios' },
		...(data.user.role === 'superadmin'
			? [
					{ href: '/users', label: 'Utilisateurs' },
					{ href: '/audit', label: 'Audit' }
				]
			: [])
	]);

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

	// Menu mobile (< 768px) : tiroir sous la barre du haut.
	let menuOpen = $state(false);
	let menuBtn = $state<HTMLButtonElement>();
	let sheetEl = $state<HTMLElement>();

	afterNavigate(() => {
		menuOpen = false;
	});

	$effect(() => {
		if (!menuOpen) return;
		const prev = document.body.style.overflow;
		document.body.style.overflow = 'hidden';
		tick().then(() => sheetEl?.querySelector<HTMLElement>('a, select, button')?.focus());
		return () => {
			document.body.style.overflow = prev;
		};
	});

	function onWindowKey(e: KeyboardEvent) {
		if (e.key === 'Escape' && menuOpen) {
			menuOpen = false;
			menuBtn?.focus();
		}
	}

	const isActive = (href: string) =>
		page.url.pathname === href || page.url.pathname.startsWith(href + '/');
</script>

<svelte:window onkeydown={onWindowKey} />

{#snippet brandLink()}
	<a href="/dashboard" class="brand">
		<svg
			xmlns="http://www.w3.org/2000/svg"
			viewBox="0 0 64 64"
			width="22"
			height="22"
			class="brand-mark"
			aria-hidden="true"
			focusable="false"
		>
			<defs><clipPath id="rf-clip-nav"><rect width="64" height="64" rx="15" /></clipPath></defs>
			<rect width="64" height="64" rx="15" fill="#111419" />
			<path d="M50 -1V7.44" stroke="#f2f3f5" stroke-width="2.71" clip-path="url(#rf-clip-nav)" />
			<circle cx="50" cy="10.87" r="3.79" fill="none" stroke="#f2f3f5" stroke-width="3.97" />
			<path
				d="M48.01 14.48V28.69A4.41 4.41 0 0 1 44.23 33.05L42.34 36.97A8.38 8.38 0 0 0 51.99 28.69V14.48ZM35 15.51C36.14 15.91 40.94 22.75 41.84 24.3C42.14 24.85 42.14 25.4 41.84 25.58L38.98 26L38.98 29.16L35 28.54Z"
				fill="#f2f3f5"
			/>
			<path
				d="M42.17 31.73C42.89 33.75 40.3 35.26 40.58 37.19C42.03 37.94 44.07 37.08 45.38 38.17C46.08 40.16 43.87 43.6 42.82 45.25C39.81 50.02 33.11 53.23 27.52 53C25.96 52.93 24.4 52.65 22.93 52.14C22.26 51.91 21.61 51.53 20.97 51.36C20.03 52.6 18.98 53.76 18.08 55.03C17.38 56.01 16.64 57.21 15.74 58.01C15.42 58.3 15.2 58.37 14.8 58.46C14.23 58.38 13.98 58.25 13.56 57.85C12.9 56.11 13.37 51.53 13.28 49.41C12.14 47.96 7.58 44.53 7.1 43.4C6.89 42.91 7.08 42.46 7.31 42.04C7.62 41.82 7.86 41.62 8.26 41.59C8.8 41.55 9.35 41.7 9.88 41.72C12.28 41.82 14.68 42.17 17.08 42.22C17.64 40.85 18.04 39.4 18.89 38.13C22.43 32.85 28.29 29.81 34.64 29.78C36.63 29.76 40.77 30.31 42.17 31.73ZM36.82 36.82A3.25 3.25 0 1 0 30.32 36.82A3.25 3.25 0 1 0 36.82 36.82Z"
				fill="#f94e3a"
				fill-rule="evenodd"
			/>
		</svg>
		redfish
	</a>
{/snippet}

{#snippet tenantForm(idp: string)}
	{#if data.tenants.length > 1}
		<form method="POST" action="/set-tenant" class="tenant-switcher">
			<input type="hidden" name="redirectTo" value={page.url.pathname} />
			<label class="tenant-label" for="tenant-{idp}">
				<span class="rf-eyebrow">Organisation</span>
				<select
					id="tenant-{idp}"
					name="tenantId"
					class="tenant-select"
					onchange={(e) => e.currentTarget.form?.requestSubmit()}
				>
					{#each data.tenants as t (t.id)}
						<option value={t.id} selected={t.id === data.activeTenant?.id}>{t.name}</option>
					{/each}
				</select>
			</label>
			<noscript><button type="submit" class="rf-btn rf-btn-ghost">Changer</button></noscript>
		</form>
	{/if}
{/snippet}

<div class="shell">
	<header class="topbar">
		<div class="mbar">
			{@render brandLink()}
			<button
				type="button"
				class="menu-btn"
				bind:this={menuBtn}
				aria-expanded={menuOpen}
				aria-controls="mobile-menu"
				aria-label={menuOpen ? 'Fermer le menu' : 'Ouvrir le menu'}
				onclick={() => (menuOpen = !menuOpen)}
			>
				<svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true" focusable="false">
					{#if menuOpen}
						<path d="M4 4L16 16M16 4L4 16" stroke="currentColor" stroke-width="1.75" fill="none" />
					{:else}
						<path
							d="M3 5.5H17M3 10H17M3 14.5H17"
							stroke="currentColor"
							stroke-width="1.75"
							fill="none"
						/>
					{/if}
				</svg>
				<span>Menu</span>
			</button>
		</div>
		<nav class="nav">
			{@render brandLink()}

			<ul class="nav-links">
				{#each links as l (l.href)}
					<li>
						<a
							href={l.href}
							aria-current={isActive(l.href) ? 'page' : undefined}
							class="nav-link"
							class:active={isActive(l.href)}
						>
							{l.label}
						</a>
					</li>
				{/each}
			</ul>

			<div class="nav-end">
				{@render tenantForm('nav')}
				<a href="/account" class="user-email" title="Mon compte">{data.user.email}</a>
				<form method="POST" action="/logout">
					<Button type="submit" variant="ghost" size="sm">Déconnexion</Button>
				</form>
			</div>
		</nav>
	</header>

	{#if menuOpen}
		<div class="sheet-wrap">
			<button
				type="button"
				class="backdrop"
				tabindex="-1"
				aria-label="Fermer le menu"
				onclick={() => (menuOpen = false)}
			></button>
			<div class="sheet" id="mobile-menu" bind:this={sheetEl}>
				<ul class="sheet-links">
					{#each links as l (l.href)}
						<li>
							<a
								href={l.href}
								class="sheet-link"
								class:active={isActive(l.href)}
								aria-current={isActive(l.href) ? 'page' : undefined}
							>
								{l.label}
							</a>
						</li>
					{/each}
				</ul>
				<div class="sheet-account">
					{@render tenantForm('sheet')}
					<a href="/account" class="user-email" title="Mon compte">{data.user.email}</a>
					<form method="POST" action="/logout">
						<Button type="submit" variant="ghost" class="sheet-logout">Déconnexion</Button>
					</form>
				</div>
			</div>
		</div>
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
	<Toast />
</div>

<style>
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

	.shell {
		min-height: 100vh;
		background: var(--c-canvas);
		color: var(--c-ink);
	}

	.topbar {
		background: var(--c-surface-1);
		border-bottom: 1px solid var(--c-line);
	}

	.mbar,
	.sheet-wrap {
		display: none;
	}

	.nav {
		max-width: 72rem;
		margin: 0 auto;
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 1.25rem;
		padding: 0.625rem 1.5rem;
	}

	.brand {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		font-weight: 600;
		letter-spacing: -0.02em;
		color: var(--c-ink);
		text-decoration: none;
	}
	.brand-mark {
		display: block;
		flex: none;
	}

	.nav-links {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.125rem;
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.nav-link {
		display: inline-block;
		padding: 0.375rem 0.625rem;
		border-radius: var(--r-flat);
		color: var(--c-ink-dim);
		text-decoration: none;
		transition:
			background-color 0.12s ease,
			color 0.12s ease;
	}
	.nav-link:hover {
		background: var(--c-surface-2);
		color: var(--c-ink);
	}
	.nav-link.active {
		background: var(--c-surface-2);
		color: var(--c-ink);
	}

	.nav-end {
		margin-left: auto;
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 1rem;
	}

	.tenant-switcher {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}
	.tenant-label {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
	}
	.tenant-select {
		background: var(--c-surface-2);
		border: 1px solid var(--c-line-strong);
		border-radius: var(--r-btn);
		padding: 0.3125rem 0.5rem;
		color: var(--c-ink);
		font-family: var(--font-ui);
		font-size: 0.8125rem;
	}
	.tenant-select:focus {
		outline: none;
		border-color: var(--c-ink-dim);
	}

	.user-email {
		color: var(--c-ink-dim);
	}

	@media (max-width: 767px) {
		.topbar {
			position: sticky;
			top: 0;
			z-index: 40;
		}
		.nav {
			display: none;
		}
		.mbar {
			display: flex;
			align-items: center;
			justify-content: space-between;
			gap: 0.75rem;
			padding: 0.25rem 1rem;
			padding-left: max(1rem, env(safe-area-inset-left));
			padding-right: max(1rem, env(safe-area-inset-right));
			min-height: 3.25rem;
		}
		.brand {
			min-height: 44px;
			min-width: 44px;
		}
		.menu-btn {
			display: inline-flex;
			align-items: center;
			gap: 0.5rem;
			min-height: 44px;
			min-width: 44px;
			padding: 0 0.75rem;
			border: 1px solid var(--c-line-strong);
			border-radius: var(--r-btn);
			background: transparent;
			color: var(--c-ink);
			font: inherit;
			font-weight: 500;
			cursor: pointer;
		}
		.menu-btn:hover {
			background: var(--c-surface-2);
		}
		.sheet-wrap {
			display: block;
			position: fixed;
			inset: 0;
			top: 3.25rem;
			z-index: 39;
		}
		.backdrop {
			position: absolute;
			inset: 0;
			border: 0;
			padding: 0;
			background: color-mix(in srgb, var(--c-canvas) 80%, transparent);
			cursor: default;
		}
		.sheet {
			position: relative;
			max-height: 100%;
			overflow-y: auto;
			overscroll-behavior: contain;
			background: var(--c-surface-1);
			border-bottom: 1px solid var(--c-line-strong);
			padding: 0.5rem 1rem 1rem;
		}
		.sheet-links {
			list-style: none;
			margin: 0;
			padding: 0;
		}
		.sheet-link {
			display: flex;
			align-items: center;
			min-height: 48px;
			padding: 0 0.75rem;
			border-radius: var(--r-flat);
			color: var(--c-ink-dim);
			text-decoration: none;
			font-size: 0.9375rem;
		}
		.sheet-link.active {
			background: var(--c-surface-2);
			color: var(--c-ink);
			box-shadow: inset 2px 0 0 var(--c-ink);
		}
		.sheet-account {
			display: flex;
			flex-direction: column;
			gap: 0.75rem;
			margin-top: 0.5rem;
			padding: 0.75rem 0.75rem 0;
			border-top: 1px solid var(--c-line);
		}
		.sheet-account .tenant-switcher,
		.sheet-account .tenant-label {
			display: flex;
			flex-direction: column;
			align-items: stretch;
			gap: 0.375rem;
			width: 100%;
		}
		.tenant-select {
			width: 100%;
			min-height: 44px;
			font-size: 16px;
		}
		.user-email {
			overflow-wrap: anywhere;
		}
		.sheet-account :global(.sheet-logout) {
			width: 100%;
			min-height: 44px;
		}
		.nav-skeleton {
			padding: 1rem;
		}
	}
</style>
