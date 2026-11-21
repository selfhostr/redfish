<script lang="ts">
	// Onglets accessibles au clavier (flèches / Home / End), motif WAI-ARIA.
	// Contrôlé via `bind:value` (id de l'onglet actif). Le consommateur rend
	// les panneaux : role="tabpanel", id={`panel-${id}`}, aria-labelledby={`tab-${id}`}.
	type Tab = { id: string; label: string };

	type Props = {
		tabs: Tab[];
		value?: string;
		/** Libellé accessible de la liste d'onglets. */
		label?: string;
		class?: string;
	};

	let { tabs, value = $bindable(), label = 'Onglets', class: klass = '' }: Props = $props();

	$effect(() => {
		if ((value === undefined || !tabs.some((t) => t.id === value)) && tabs.length > 0) {
			value = tabs[0].id;
		}
	});

	function onkeydown(event: KeyboardEvent, index: number) {
		const last = tabs.length - 1;
		let next = index;
		switch (event.key) {
			case 'ArrowRight':
			case 'ArrowDown':
				next = index === last ? 0 : index + 1;
				break;
			case 'ArrowLeft':
			case 'ArrowUp':
				next = index === 0 ? last : index - 1;
				break;
			case 'Home':
				next = 0;
				break;
			case 'End':
				next = last;
				break;
			default:
				return;
		}
		event.preventDefault();
		value = tabs[next].id;
		const list = (event.currentTarget as HTMLElement).parentElement;
		list?.querySelectorAll<HTMLElement>('[role="tab"]')[next]?.focus();
	}
</script>

<div role="tablist" aria-label={label} class="tabs {klass}">
	{#each tabs as tab, i (tab.id)}
		<button
			type="button"
			role="tab"
			id={`tab-${tab.id}`}
			aria-selected={value === tab.id}
			aria-controls={`panel-${tab.id}`}
			tabindex={value === tab.id ? 0 : -1}
			class="tab"
			class:active={value === tab.id}
			onclick={() => (value = tab.id)}
			onkeydown={(e) => onkeydown(e, i)}
		>
			{tab.label}
		</button>
	{/each}
</div>

<style>
	.tabs {
		display: inline-flex;
		gap: 0.25rem;
		border-bottom: 1px solid var(--c-line);
	}

	@media (max-width: 767px) {
		.tabs {
			display: flex;
			max-width: 100%;
			overflow-x: auto;
			overscroll-behavior-x: contain;
			scrollbar-width: none;
			-webkit-overflow-scrolling: touch;
		}
		.tabs::-webkit-scrollbar {
			display: none;
		}
		.tab {
			flex: none;
			white-space: nowrap;
			min-height: 44px;
		}
	}

	.tab {
		position: relative;
		padding: 0.5rem 0.75rem;
		margin-bottom: -1px;
		border: none;
		border-bottom: 2px solid transparent;
		background: transparent;
		color: var(--c-ink-dim);
		font-family: var(--font-ui);
		font-size: 0.8125rem;
		font-weight: 500;
		line-height: 1.2;
		cursor: pointer;
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
</style>
