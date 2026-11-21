<script lang="ts">
	import type { Snippet } from 'svelte';

	// Pastille de statut : le sens est toujours porté par un point/icône + un mot,
	// JAMAIS par la couleur seule. La couleur ne fait que renforcer le sens.
	type Variant = 'signal' | 'advisory' | 'warning' | 'info' | 'neutral';

	type Props = {
		variant?: Variant;
		/** Masque le point si une icône est fournie dans le slot `icon`. */
		icon?: Snippet;
		class?: string;
		children: Snippet;
		[key: string]: unknown;
	};

	let { variant = 'neutral', icon, class: klass = '', children, ...rest }: Props = $props();
</script>

<span class="plate {variant} {klass}" {...rest}>
	{#if icon}
		<span class="plate-icon" aria-hidden="true">{@render icon()}</span>
	{:else}
		<span class="dot" aria-hidden="true"></span>
	{/if}
	<span class="plate-label">{@render children()}</span>
</span>

<style>
	.plate {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0.1875rem 0.5rem;
		border: 1px solid var(--c-line-strong);
		border-radius: var(--r-flat);
		background: var(--plate-bg, var(--c-surface-2));
		font-size: 0.75rem;
		line-height: 1.2;
		white-space: nowrap;
		max-width: 100%;
	}

	.plate-label {
		overflow-wrap: anywhere;
	}

	.dot {
		width: 0.5rem;
		height: 0.5rem;
		border-radius: 50%;
		background: var(--plate-color);
		flex: none;
	}

	.plate-icon {
		display: inline-flex;
		color: var(--plate-color);
	}

	.plate-label {
		color: var(--plate-color);
		font-weight: 500;
	}

	.signal {
		--plate-color: var(--c-signal);
		--plate-bg: var(--c-signal-bg);
	}
	.advisory {
		--plate-color: var(--c-advisory);
		--plate-bg: var(--c-advisory-bg);
	}
	.warning {
		--plate-color: var(--c-warning);
		--plate-bg: var(--c-warning-bg);
	}
	.info {
		--plate-color: var(--c-info);
		--plate-bg: var(--c-info-bg);
	}
	.neutral {
		--plate-color: var(--c-ink-dim);
	}
</style>
