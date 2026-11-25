<script lang="ts">
	import type { Snippet } from 'svelte';

	/**
	 * Cadre commun de toutes les pages de l'app : pleine largeur de la colonne de contenu, mêmes
	 * marges, même en-tête (un h1, une phrase qui dit ce que montre la page, les actions à droite).
	 * Les pages n'imposent plus leur propre largeur maximale : la mise en page interne (grilles,
	 * colonnes) occupe l'espace disponible.
	 */
	type Props = {
		title: string;
		/** Une phrase en langage simple : ce que montre la page ou ce qu'on y fait. */
		description?: string | Snippet;
		/** Actions de la page (au plus un bouton primaire). */
		actions?: Snippet;
		/** Contenu sous le titre (méta, pastille de statut…). */
		meta?: Snippet;
		class?: string;
		children: Snippet;
	};
	let { title, description, actions, meta, class: klass = '', children }: Props = $props();
</script>

<main class="page {klass}">
	<header class="page-head">
		<div class="page-head-text">
			<h1 class="rf-page-title">{title}</h1>
			{#if meta}<div class="page-meta">{@render meta()}</div>{/if}
			{#if description}
				<p class="page-desc">
					{#if typeof description === 'string'}{description}{:else}{@render description()}{/if}
				</p>
			{/if}
		</div>
		{#if actions}<div class="page-actions">{@render actions()}</div>{/if}
	</header>
	{@render children()}
</main>

<style>
	.page {
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
		width: 100%;
		min-width: 0;
		padding: 1.25rem 1rem 2.5rem;
	}
	@media (min-width: 640px) {
		.page {
			padding: 1.5rem 1.5rem 3rem;
		}
	}
	@media (min-width: 1024px) {
		.page {
			padding: 1.75rem 2.5rem 3rem;
		}
	}

	.page-head {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-start;
		justify-content: space-between;
		gap: 0.75rem 1.5rem;
	}
	.page-head-text {
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
		min-width: 0;
		flex: 1 1 24rem;
	}
	.page-desc {
		max-width: 52rem;
		color: var(--c-ink-dim);
		overflow-wrap: anywhere;
	}
	.page-meta {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem;
		color: var(--c-ink-dim);
	}
	.page-actions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem;
	}
</style>
