<script lang="ts">
	import type { Snippet } from 'svelte';

	type Props = {
		/** Ce qui a échoué, en mots actionnables (jamais une trace technique). */
		title?: string;
		/** Message renvoyé par le serveur, affiché tel quel (pas de stack trace). */
		message?: string;
		/** Actions : réessayer, sortir… */
		children?: Snippet;
		class?: string;
		[key: string]: unknown;
	};

	let {
		title = 'Une action a échoué',
		message,
		children,
		class: klass = '',
		...rest
	}: Props = $props();
</script>

<div class="notice {klass}" role="alert" {...rest}>
	<div class="notice-head">
		<span class="dot" aria-hidden="true"></span>
		<p class="notice-title">{title}</p>
	</div>
	{#if message}
		<p class="notice-msg">{message}</p>
	{/if}
	{#if children}
		<div class="notice-action">{@render children()}</div>
	{/if}
</div>

<style>
	.notice {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		padding: 0.875rem 1rem;
		border: 1px solid var(--c-line-strong);
		border-left: 2px solid var(--c-warning);
		border-radius: var(--r-btn);
		background: var(--c-surface-1);
	}

	.notice-head {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.dot {
		width: 0.5rem;
		height: 0.5rem;
		border-radius: 50%;
		background: var(--c-warning);
		flex: none;
	}

	@media (max-width: 767px) {
		.notice {
			padding: 0.75rem;
		}
	}

	.notice-title {
		overflow-wrap: anywhere;
		font-weight: 600;
		color: var(--c-ink);
	}

	.notice-msg {
		color: var(--c-ink-dim);
		line-height: 1.5;
		/* Message serveur : préserve la mise en forme sans déborder. */
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}

	.notice-action {
		margin-top: 0.125rem;
	}
</style>
