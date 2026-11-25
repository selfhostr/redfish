<script lang="ts">
	import NavMenu from '$lib/components/NavMenu.svelte';
	import Icon from './Icon.svelte';
	import Logo from './Logo.svelte';
	import { DOCS_URL, GITHUB_URL, entryActive, isUnder, type NavSection } from './nav';

	type Tenant = { id: string; name: string };
	type Props = {
		/** `expanded` et `rail` : barre de bureau dépliée / repliée ; `drawer` : tiroir mobile. */
		variant: 'expanded' | 'rail' | 'drawer';
		sections: NavSection[];
		path: string;
		user: { email: string; role: string };
		tenants: Tenant[];
		activeTenant: Tenant | null;
		toggleHint?: string;
		onToggle?: () => void;
	};
	let { variant, sections, path, user, tenants, activeTenant, toggleHint, onToggle }: Props =
		$props();

	const rail = $derived(variant === 'rail');
	const accountActive = $derived(isUnder(path, '/account'));
	const initial = $derived(user.email.charAt(0).toUpperCase());
	const menuSide = $derived(rail ? 'right' : 'bottom');
	const footSide = $derived(rail ? 'right' : 'top');
</script>

{#snippet clientMenuItems()}
	{#if activeTenant && tenants.length > 1}
		<form method="POST" action="/set-tenant">
			<input type="hidden" name="redirectTo" value="/dashboard" />
			<p class="menu-label">Changer de client</p>
			{#each tenants as t (t.id)}
				{@const current = t.id === activeTenant.id}
				<button
					type="submit"
					name="tenantId"
					value={t.id}
					class="menu-item"
					class:current
					aria-current={current ? 'true' : undefined}
				>
					<span class="check">
						{#if current}<Icon name="check" size={14} />{/if}
					</span>
					<span class="grow">{t.name}</span>
				</button>
			{/each}
		</form>
		<hr class="sep" />
	{/if}
	{#if activeTenant}
		<a href="/tenants/{activeTenant.id}" class="menu-item">
			<Icon name="settings" size={14} /> Paramètres de ce client
		</a>
	{/if}
	<a href="/tenants" class="menu-item"><Icon name="building" size={14} /> Gérer les clients</a>
{/snippet}

<div class="sidebar" class:rail>
	{#if variant !== 'drawer'}
		<div class="head">
			{#if rail}
				<button
					type="button"
					class="rail-btn toggle-mark"
					onclick={onToggle}
					aria-label="Déplier la barre latérale"
					title="Déplier la barre latérale ({toggleHint})"
					aria-expanded="false"
					aria-controls="sidebar"
				>
					<span class="mark"><Logo withName={false} /></span>
					<span class="open-icon"><Icon name="panelOpen" size={18} /></span>
				</button>
			{:else}
				<a href="/dashboard" class="brand"><Logo /></a>
				<button
					type="button"
					class="icon-btn"
					onclick={onToggle}
					aria-label="Replier la barre latérale"
					title="Replier la barre latérale ({toggleHint})"
					aria-expanded="true"
					aria-controls="sidebar"
				>
					<Icon name="panelClose" size={16} />
				</button>
			{/if}
		</div>
	{/if}

	<!-- Client actif : le contexte de toutes les pages « Client ». -->
	<div class="client">
		{#if activeTenant}
			<NavMenu
				id="client-menu-{variant}"
				side={menuSide}
				triggerClass="client-trigger"
				chevron={false}
				label={rail ? `Client actif : ${activeTenant.name}` : undefined}
				active={isUnder(path, '/tenants')}
			>
				{#snippet trigger()}
					{#if rail}
						<span class="client-initial" aria-hidden="true">{activeTenant!.name.charAt(0)}</span>
					{:else}
						<span class="client-text">
							<span class="sr-only">Client actif :</span>
							<span class="client-caption" aria-hidden="true">Client</span>
							<span class="client-name">{activeTenant!.name}</span>
						</span>
						<span class="up-down"><Icon name="upDown" size={14} /></span>
					{/if}
				{/snippet}
				{@render clientMenuItems()}
			</NavMenu>
		{:else}
			<a href="/tenants" class="no-client" title="Créer un client">
				<Icon name="building" size={16} />
				{#if !rail}<span>Créer un client</span>{/if}
			</a>
		{/if}
	</div>

	<nav class="nav" aria-label="Navigation principale">
		{#each sections as s (s.id)}
			{#if s.entries.length}
				<div class="section" role="group" aria-labelledby="nav-{variant}-{s.id}">
					<p
						class="section-label"
						class:sr-only={rail || s.id === 'client'}
						id="nav-{variant}-{s.id}"
					>
						{s.label}
					</p>
					<ul>
						{#each s.entries as e (e.href)}
							{@const current = entryActive(path, e)}
							<li>
								<a
									href={e.href}
									class="entry"
									class:current
									aria-current={current ? 'page' : undefined}
									title={rail ? e.label : undefined}
								>
									<Icon name={e.icon} size={rail ? 18 : 16} />
									<span class="entry-label" class:sr-only={rail}>{e.label}</span>
								</a>
							</li>
						{/each}
					</ul>
				</div>
			{/if}
		{/each}
	</nav>

	<div class="foot">
		<ul class="links">
			<li>
				<a
					href={DOCS_URL}
					target="_blank"
					rel="noopener noreferrer"
					class="entry"
					title={rail ? 'Documentation' : undefined}
				>
					<Icon name="book" size={rail ? 18 : 16} />
					<span class="entry-label" class:sr-only={rail}>Documentation</span>
					<span class="sr-only">(nouvel onglet)</span>
				</a>
			</li>
			<li>
				<a
					href={GITHUB_URL}
					target="_blank"
					rel="noopener noreferrer"
					class="entry"
					title={rail ? 'GitHub' : undefined}
				>
					<svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor" aria-hidden="true">
						<path
							d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z"
						/>
					</svg>
					<span class="entry-label" class:sr-only={rail}>GitHub</span>
					<span class="sr-only">(nouvel onglet)</span>
				</a>
			</li>
		</ul>
		<NavMenu
			id="account-menu-{variant}"
			side={footSide}
			triggerClass="account-trigger"
			chevron={false}
			label={rail ? `Compte : ${user.email}` : undefined}
			active={accountActive}
		>
			{#snippet trigger()}
				<span class="avatar" aria-hidden="true">{initial}</span>
				{#if !rail}
					<span class="account-text">
						<span class="sr-only">Compte :</span>
						<span class="account-email">{user.email}</span>
					</span>
				{/if}
			{/snippet}
			<p class="menu-label truncate">{user.email}</p>
			<a
				href="/account"
				class="menu-item"
				class:current={accountActive}
				aria-current={accountActive ? 'page' : undefined}
			>
				<Icon name="user" size={14} /> Mon compte
			</a>
			<form method="POST" action="/logout">
				<button type="submit" class="menu-item">
					<Icon name="logOut" size={14} /> Déconnexion
				</button>
			</form>
		</NavMenu>
	</div>
</div>

<style>
	.sidebar {
		display: flex;
		flex-direction: column;
		height: 100%;
		min-height: 0;
	}

	.head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		height: 3.5rem;
		flex: none;
		padding: 0 0.5rem 0 1.25rem;
	}
	.rail .head {
		padding: 0 0.5rem;
	}
	.brand {
		border-radius: var(--r-flat);
		text-decoration: none;
	}

	.icon-btn,
	.rail-btn {
		display: grid;
		place-items: center;
		border: 0;
		background: transparent;
		color: var(--c-ink-dim);
		cursor: pointer;
		transition:
			background-color 0.15s ease,
			color 0.15s ease;
	}
	.icon-btn {
		width: 2rem;
		height: 2rem;
		border-radius: var(--r-flat);
	}
	.rail-btn {
		width: 2.5rem;
		height: 2.5rem;
		border-radius: var(--r-btn);
		color: var(--c-ink);
	}
	.icon-btn:hover,
	.rail-btn:hover {
		background: var(--c-surface-2);
		color: var(--c-ink);
	}
	/* Replié : le logo est l'interrupteur, et devient l'icône « déplier » au survol. */
	.toggle-mark > span {
		grid-area: 1 / 1;
		display: grid;
		place-items: center;
		transition: opacity 0.15s ease;
	}
	.toggle-mark .open-icon,
	.toggle-mark:hover .mark,
	.toggle-mark:focus-visible .mark {
		opacity: 0;
	}
	.toggle-mark:hover .open-icon,
	.toggle-mark:focus-visible .open-icon {
		opacity: 1;
	}

	/* --- Client actif ------------------------------------------------------------------ */
	.client {
		flex: none;
		padding: 0.25rem 0.75rem 0.5rem;
	}
	.rail .client {
		padding: 0.25rem 0.5rem 0.5rem;
	}
	.client :global(.menu) {
		width: 100%;
	}
	.client :global(.client-trigger) {
		width: 100%;
		max-width: none;
		gap: 0.5rem;
		padding: 0.4375rem 0.625rem;
		border: 1px solid var(--c-line-strong);
		border-radius: var(--r-btn);
		background: var(--c-surface-1);
		color: var(--c-ink);
		text-align: left;
	}
	.rail .client :global(.client-trigger) {
		width: 2.5rem;
		height: 2.5rem;
		padding: 0;
		justify-content: center;
	}
	.client-text {
		display: flex;
		flex-direction: column;
		flex: 1;
		min-width: 0;
		line-height: 1.3;
	}
	.client-caption {
		font-size: 0.6875rem;
		color: var(--c-ink-dim);
	}
	.client-name {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-weight: 500;
	}
	.client-initial {
		font-weight: 600;
	}
	.up-down {
		flex: none;
		color: var(--c-ink-dim);
	}
	.no-client {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		min-height: 2.5rem;
		padding: 0 0.625rem;
		border: 1px dashed var(--c-line-strong);
		border-radius: var(--r-btn);
		color: var(--c-ink-dim);
		text-decoration: none;
	}
	.no-client:hover {
		color: var(--c-ink);
		border-color: var(--c-ink-dim);
	}
	.rail .no-client {
		width: 2.5rem;
		justify-content: center;
		padding: 0;
	}

	/* --- Navigation --------------------------------------------------------------------- */
	.nav {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		overscroll-behavior: contain;
		padding: 0.25rem 0.75rem 0.75rem;
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}
	.rail .nav {
		padding: 0.25rem 0.5rem;
		gap: 0.5rem;
	}
	.rail .section + .section {
		padding-top: 0.5rem;
		border-top: 1px solid var(--c-line);
	}
	.section-label {
		margin: 0 0 0.25rem;
		padding: 0 0.625rem;
		font-size: 0.75rem;
		font-weight: 500;
		color: var(--c-ink-dim);
	}
	.section ul {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 1px;
	}
	.entry {
		position: relative;
		display: flex;
		align-items: center;
		gap: 0.625rem;
		height: 2rem;
		padding: 0 0.625rem;
		border-radius: var(--r-flat);
		color: var(--c-ink-dim);
		text-decoration: none;
		transition:
			background-color 0.15s ease,
			color 0.15s ease;
	}
	.entry:hover {
		background: color-mix(in srgb, var(--c-surface-2) 70%, transparent);
		color: var(--c-ink);
	}
	.entry.current {
		background: var(--c-surface-2);
		color: var(--c-ink);
		font-weight: 500;
	}
	.rail .entry {
		width: 2.5rem;
		height: 2.5rem;
		padding: 0;
		justify-content: center;
		border-radius: var(--r-btn);
	}
	.entry-label {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	/* --- Pied : liens, puis le compte ----------------------------------------------------- */
	.foot {
		flex: none;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		padding: 0.75rem;
		border-top: 1px solid var(--c-line);
	}
	.rail .foot {
		padding: 0.5rem;
		align-items: flex-start;
	}
	.links {
		display: flex;
		flex-direction: column;
		gap: 1px;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.foot :global(.menu) {
		width: 100%;
	}
	.foot :global(.account-trigger) {
		width: 100%;
		max-width: none;
		gap: 0.625rem;
		padding: 0.375rem 0.5rem;
		color: var(--c-ink);
		text-align: left;
	}
	.rail .foot :global(.account-trigger) {
		width: 2.5rem;
		height: 2.5rem;
		padding: 0;
		justify-content: center;
	}
	.avatar {
		display: grid;
		place-items: center;
		flex: none;
		width: 1.75rem;
		height: 1.75rem;
		border-radius: 999px;
		background: var(--c-surface-2);
		border: 1px solid var(--c-line-strong);
		font-size: 0.75rem;
		font-weight: 600;
	}
	.account-text {
		display: flex;
		flex-direction: column;
		flex: 1;
		min-width: 0;
		line-height: 1.3;
	}
	.account-email {
		font-size: 0.875rem;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-weight: 500;
	}

	/* --- Entrées des menus déroulants ------------------------------------------------------ */
	.menu-label {
		margin: 0;
		padding: 0.375rem 0.625rem 0.25rem;
		font-size: 0.75rem;
		color: var(--c-ink-dim);
	}
	.truncate {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.menu-item {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		width: 100%;
		min-height: 2rem;
		padding: 0.375rem 0.625rem;
		border: 0;
		border-radius: var(--r-flat);
		background: transparent;
		color: var(--c-ink-dim);
		font: inherit;
		text-align: left;
		text-decoration: none;
		cursor: pointer;
	}
	.menu-item:hover,
	.menu-item:focus-visible,
	.menu-item.current {
		background: var(--c-surface-2);
		color: var(--c-ink);
	}
	.grow {
		flex: 1;
		min-width: 0;
		overflow-wrap: anywhere;
	}
	.check {
		display: inline-flex;
		flex: none;
		width: 14px;
		color: var(--c-signal);
	}
	.sep {
		margin: 0.375rem 0;
		border: 0;
		border-top: 1px solid var(--c-line);
	}

	/* Tiroir mobile : cibles de 44 px (guidelines 3.8). */
	@media (max-width: 1023px) {
		.entry,
		.menu-item {
			min-height: 2.75rem;
		}
	}
</style>
