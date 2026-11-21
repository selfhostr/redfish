<script lang="ts">
	import type { Snippet } from 'svelte';

	type Props = {
		/** Titre court (optionnel). */
		title?: string;
		/** Une phrase décrivant ce qui manque. */
		message: string;
		/** Icône décorative optionnelle. */
		icon?: Snippet;
		/** Action proposée (bouton…). */
		children?: Snippet;
		class?: string;
		[key: string]: unknown;
	};

	let { title, message, icon, children, class: klass = '', ...rest }: Props = $props();
</script>

<div class="empty {klass}" {...rest}>
	{#if icon}
		<div class="empty-icon" aria-hidden="true">{@render icon()}</div>
	{/if}
	{#if title}
		<p class="empty-title">{title}</p>
	{/if}
	<p class="empty-msg">{message}</p>
	{#if children}
		<div class="empty-action">{@render children()}</div>
	{/if}
</div>

<style>
	.empty {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.625rem;
		text-align: center;
		padding: 2.5rem 1.5rem;
		border: 1px dashed var(--c-line-strong);
		border-radius: var(--r-card);
		background: var(--c-surface-1);
	}

	.empty-icon {
		color: var(--c-ink-dim);
	}

	.empty-title {
		font-weight: 600;
		letter-spacing: -0.02em;
		color: var(--c-ink);
	}

	.empty-msg {
		max-width: 42ch;
		color: var(--c-ink-dim);
		line-height: 1.5;
	}

	@media (max-width: 767px) {
		.empty {
			padding: 1.75rem 1rem;
		}
	}

	.empty-title,
	.empty-msg {
		max-width: 100%;
		overflow-wrap: anywhere;
	}

	.empty-action {
		margin-top: 0.25rem;
	}
</style>
