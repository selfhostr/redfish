<script lang="ts">
	import type { Snippet } from 'svelte';

	// Un SEUL bouton primaire par vue : le primaire est neutre (clair sur fond
	// sombre) et attire l'action principale. Les actions secondaires utilisent
	// `secondary`/`ghost`. `danger` est réservé aux actions destructrices (rare).
	type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
	type Size = 'sm' | 'md';

	type Props = {
		variant?: Variant;
		size?: Size;
		href?: string;
		type?: 'button' | 'submit' | 'reset';
		disabled?: boolean;
		class?: string;
		children: Snippet;
		[key: string]: unknown;
	};

	let {
		variant = 'secondary',
		size = 'md',
		href,
		type = 'button',
		disabled = false,
		class: klass = '',
		children,
		...rest
	}: Props = $props();
</script>

{#if href}
	<a
		{href}
		class="btn {variant} {size} {klass}"
		class:disabled
		aria-disabled={disabled || undefined}
		{...rest}
	>
		{@render children()}
	</a>
{:else}
	<button {type} class="btn {variant} {size} {klass}" {disabled} {...rest}>
		{@render children()}
	</button>
{/if}

<style>
	.btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		border: 1px solid transparent;
		border-radius: var(--r-btn);
		font-family: var(--font-ui);
		font-weight: 500;
		line-height: 1.2;
		text-decoration: none;
		white-space: nowrap;
		cursor: pointer;
		transition:
			background-color 0.12s ease,
			border-color 0.12s ease,
			color 0.12s ease;
	}

	.md {
		padding: 0.5rem 0.875rem;
		font-size: 0.8125rem;
	}
	.sm {
		padding: 0.3125rem 0.625rem;
		font-size: 0.75rem;
	}

	/* Primaire : neutre, clair sur sombre (aucune couleur de marque) */
	.primary {
		background: var(--c-ink);
		color: var(--c-on-ink);
		border-color: var(--c-ink);
	}
	.primary:hover:not(:disabled):not(.disabled) {
		background: var(--c-ink-hover);
		border-color: var(--c-ink-hover);
	}

	.secondary,
	.ghost {
		background: transparent;
		color: var(--c-ink);
		border-color: var(--c-line-strong);
	}
	.secondary:hover:not(:disabled):not(.disabled),
	.ghost:hover:not(:disabled):not(.disabled) {
		background: var(--c-surface-2);
		border-color: var(--c-ink-dim);
	}

	/* Danger : réservé aux actions destructrices, teinté par le sens seulement */
	.danger {
		background: transparent;
		color: var(--c-warning);
		border-color: var(--c-warning);
	}
	.danger:hover:not(:disabled):not(.disabled) {
		background: var(--c-warning-bg);
	}

	@media (max-width: 767px) {
		.btn {
			white-space: normal;
		}
	}

	.btn:disabled,
	.btn.disabled {
		opacity: 0.5;
		cursor: not-allowed;
		pointer-events: none;
	}
</style>
