<script lang="ts">
	import type { Snippet } from 'svelte';
	import { tick } from 'svelte';
	import { afterNavigate } from '$app/navigation';

	// Menu déroulant de la barre de navigation (motif « disclosure ») : le bouton
	// porte aria-expanded, Échap ferme et rend le focus au bouton, un clic ou un
	// focus en dehors ferme, les flèches parcourent les entrées.
	type Props = {
		id: string;
		trigger: Snippet;
		children: Snippet;
		align?: 'start' | 'end';
		active?: boolean;
		triggerClass?: string;
	};
	let {
		id,
		trigger,
		children,
		align = 'start',
		active = false,
		triggerClass = ''
	}: Props = $props();

	let open = $state(false);
	let root = $state<HTMLElement>();
	let btn = $state<HTMLButtonElement>();
	let panel = $state<HTMLElement>();

	afterNavigate(() => {
		open = false;
	});

	const items = () =>
		Array.from(panel?.querySelectorAll<HTMLElement>('a[href], button:not([disabled])') ?? []);

	async function show(focus: 'first' | 'last' | null) {
		open = true;
		await tick();
		const list = items();
		if (focus === 'first') list[0]?.focus();
		if (focus === 'last') list[list.length - 1]?.focus();
	}

	function close(refocus: boolean) {
		open = false;
		if (refocus) btn?.focus();
	}

	function onTriggerKey(e: KeyboardEvent) {
		if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
			e.preventDefault();
			void show(e.key === 'ArrowDown' ? 'first' : 'last');
		}
	}

	function onKey(e: KeyboardEvent) {
		if (!open) return;
		if (e.key === 'Escape') {
			e.preventDefault();
			e.stopPropagation();
			close(true);
			return;
		}
		if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'Home' && e.key !== 'End') return;
		const list = items();
		if (list.length === 0) return;
		e.preventDefault();
		const i = list.indexOf(document.activeElement as HTMLElement);
		let next = 0;
		if (e.key === 'End') next = list.length - 1;
		else if (e.key === 'ArrowDown') next = i < 0 ? 0 : (i + 1) % list.length;
		else if (e.key === 'ArrowUp') next = i <= 0 ? list.length - 1 : i - 1;
		list[next].focus();
	}

	function onFocusOut(e: FocusEvent) {
		const to = e.relatedTarget as Node | null;
		if (open && to && !root?.contains(to)) close(false);
	}

	$effect(() => {
		if (!open) return;
		const onPointer = (e: PointerEvent) => {
			if (root && !root.contains(e.target as Node)) close(false);
		};
		document.addEventListener('pointerdown', onPointer);
		return () => document.removeEventListener('pointerdown', onPointer);
	});
</script>

<div class="menu" bind:this={root} onkeydown={onKey} onfocusout={onFocusOut} role="presentation">
	<button
		type="button"
		class="trigger {triggerClass}"
		class:active
		bind:this={btn}
		aria-expanded={open}
		aria-controls={id}
		onclick={() => (open ? close(false) : show(null))}
		onkeydown={onTriggerKey}
	>
		{@render trigger()}
		<svg
			class="chevron"
			class:open
			viewBox="0 0 12 12"
			width="12"
			height="12"
			aria-hidden="true"
			focusable="false"
		>
			<path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" stroke-width="1.5" fill="none" />
		</svg>
	</button>
	<div class="panel" class:end={align === 'end'} {id} hidden={!open} bind:this={panel}>
		{@render children()}
	</div>
</div>

<style>
	.menu {
		position: relative;
	}
	.trigger {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		max-width: 18rem;
		padding: 0.375rem 0.625rem;
		border: 1px solid transparent;
		border-radius: var(--r-flat);
		background: transparent;
		color: var(--c-ink-dim);
		font: inherit;
		cursor: pointer;
		transition:
			background-color 0.12s ease,
			color 0.12s ease;
	}
	.trigger:hover,
	.trigger[aria-expanded='true'],
	.trigger.active {
		background: var(--c-surface-2);
		color: var(--c-ink);
	}
	.chevron {
		flex: none;
		transition: transform 0.12s ease;
	}
	.chevron.open {
		transform: rotate(180deg);
	}
	.panel {
		position: absolute;
		top: calc(100% + 0.375rem);
		left: 0;
		z-index: 50;
		min-width: 15rem;
		max-width: min(22rem, calc(100vw - 2rem));
		max-height: min(70vh, 32rem);
		overflow-y: auto;
		padding: 0.375rem;
		background: var(--c-surface-1);
		border: 1px solid var(--c-line-strong);
		border-radius: var(--r-card);
		box-shadow: 0 12px 32px rgb(0 0 0 / 0.35);
	}
	.panel.end {
		left: auto;
		right: 0;
	}
	.panel[hidden] {
		display: none;
	}
</style>
