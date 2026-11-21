<script lang="ts">
	import type { Snippet } from 'svelte';

	type Props = {
		/** Contenu optionnel de l'en-tête (titre, actions…). */
		header?: Snippet;
		/** Supprime le padding du corps (utile pour un tableau pleine largeur). */
		flush?: boolean;
		class?: string;
		children: Snippet;
		[key: string]: unknown;
	};

	let { header, flush = false, class: klass = '', children, ...rest }: Props = $props();
</script>

<section class="panel {klass}" {...rest}>
	{#if header}
		<header class="panel-head">
			{@render header()}
		</header>
	{/if}
	<div class="panel-body" class:flush>
		{@render children()}
	</div>
</section>

<style>
	.panel {
		background: var(--c-surface-1);
		border: 1px solid var(--c-line);
		border-radius: var(--r-card);
		overflow: hidden;
	}

	.panel-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		padding: 0.875rem 1rem;
		border-bottom: 1px solid var(--c-line);
	}

	.panel-body {
		padding: 1rem;
	}
	.panel-body.flush {
		padding: 0;
	}

	@media (max-width: 767px) {
		.panel-head {
			flex-wrap: wrap;
			gap: 0.5rem 0.75rem;
			padding: 0.75rem;
		}
		.panel-body {
			padding: 0.75rem;
		}
		.panel-body.flush {
			padding: 0;
		}
	}
</style>
