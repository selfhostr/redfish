<script lang="ts">
	// Entonnoir en barres partagé par le tableau de bord et le rapport.
	// Rendu identique au dashboard : libellé + « valeur · pourcentage % » et une
	// barre dont la largeur est la part de `base` (= envois). Le bloc @media print
	// (styles scopés Svelte) garde les barres lisibles sur fond blanc à l'impression.
	type Stage = { label: string; value: number; note?: string };
	let { stages, base }: { stages: Stage[]; base: number } = $props();

	const rows = $derived(
		stages.map((s) => ({ ...s, width: Math.round((s.value / Math.max(base, 1)) * 100) }))
	);
</script>

<div class="flex flex-col gap-3">
	{#each rows as s (s.label)}
		<div class="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 md:flex md:gap-3">
			<span class="text-ink-dim md:w-40 md:shrink-0">
				{s.label}
				{#if s.note}<span class="rf-meta mt-0.5 block">{s.note}</span>{/if}
			</span>
			<span class="text-right text-ink md:order-last md:w-24 md:shrink-0">
				{s.value} · {s.width} %
			</span>
			<div
				class="funnel-track col-span-2 h-4 overflow-hidden rounded-flat bg-surface-2 md:col-auto md:grow"
			>
				<div
					class="funnel-fill h-4 rounded-flat bg-ink-dim"
					style="width: {Math.max(s.width, s.value > 0 ? 2 : 0)}%"
				></div>
			</div>
		</div>
	{/each}
</div>

<style>
	/* Impression : plus de teintes sombres. Piste blanche cernée de gris clair,
	   remplissage gris foncé plein, pour rester visible sur papier. */
	@media print {
		.funnel-track {
			background: #ffffff;
			border: 1px solid #c8c8c8;
		}
		.funnel-fill {
			background: #222222;
		}
	}
</style>
