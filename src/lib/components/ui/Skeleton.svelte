<script lang="ts">
	// Bloc d'encombrement : occupe exactement la place du contenu final.
	// Animation par opacité (aucun dégradé décoratif).
	type Props = {
		width?: string | number;
		height?: string | number;
		radius?: string;
		class?: string;
		[key: string]: unknown;
	};

	let {
		width = '100%',
		height = '1rem',
		radius = 'var(--r-flat)',
		class: klass = '',
		...rest
	}: Props = $props();

	const toCss = (v: string | number) => (typeof v === 'number' ? `${v}px` : v);
</script>

<div
	class="skeleton {klass}"
	style="width: {toCss(width)}; height: {toCss(height)}; border-radius: {radius};"
	aria-hidden="true"
	{...rest}
></div>

<style>
	.skeleton {
		background: var(--c-surface-2);
		animation: skeleton-pulse 1.4s ease-in-out infinite;
	}

	@keyframes skeleton-pulse {
		0%,
		100% {
			opacity: 1;
		}
		50% {
			opacity: 0.45;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.skeleton {
			animation: none;
			opacity: 0.7;
		}
	}
</style>
