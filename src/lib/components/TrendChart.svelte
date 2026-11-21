<script lang="ts">
	type Point = {
		name: string;
		date: Date | string;
		clickRate: number;
		submitRate: number;
		reportRate: number;
	};
	let { points }: { points: Point[] } = $props();

	const W = 640;
	const H = 220;
	const L = 40;
	const R = 12;
	const T = 12;
	const B = 28;
	const series = [
		{ key: 'clickRate', label: 'Clics', color: 'var(--c-advisory)' },
		{ key: 'submitRate', label: 'Soumissions', color: 'var(--c-warning)' },
		{ key: 'reportRate', label: 'Signalements', color: 'var(--c-signal)' }
	] as const;

	const x = (i: number) =>
		points.length < 2 ? (L + W - R) / 2 : L + (i * (W - L - R)) / (points.length - 1);
	const y = (v: number) => T + (1 - v) * (H - T - B);
	const path = (k: (typeof series)[number]['key']) =>
		points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(p[k]).toFixed(1)}`).join(' ');
	const fmt = (d: Date | string) => new Date(d).toLocaleDateString('fr-FR');
</script>

<div class="flex flex-col gap-3">
	<svg
		viewBox="0 0 {W} {H}"
		class="h-auto w-full"
		role="img"
		aria-label="Évolution des taux de clic, de soumission et de signalement par campagne terminée"
	>
		{#each [0, 0.25, 0.5, 0.75, 1] as g (g)}
			<line x1={L} x2={W - R} y1={y(g)} y2={y(g)} stroke="var(--c-line)" />
			<text x={L - 6} y={y(g) + 4} text-anchor="end" font-size="11" fill="var(--c-ink-dim)">
				{Math.round(g * 100)} %
			</text>
		{/each}
		{#each series as s (s.key)}
			<path d={path(s.key)} fill="none" stroke={s.color} stroke-width="2" stroke-linejoin="round" />
			{#each points as p, i (i)}
				<circle cx={x(i)} cy={y(p[s.key])} r="3.5" fill={s.color}>
					<title>{p.name} ({fmt(p.date)}) · {s.label} : {Math.round(p[s.key] * 100)} %</title>
				</circle>
			{/each}
		{/each}
		{#each points as p, i (i)}
			{#if points.length <= 6 || i === 0 || i === points.length - 1}
				<text x={x(i)} y={H - 8} text-anchor="middle" font-size="11" fill="var(--c-ink-dim)">
					{fmt(p.date)}
				</text>
			{/if}
		{/each}
	</svg>
	<ul class="flex flex-wrap gap-4 text-xs text-ink-dim">
		{#each series as s (s.key)}
			<li class="flex items-center gap-1.5">
				<span class="inline-block h-0.5 w-4" style="background: {s.color}"></span>{s.label}
			</li>
		{/each}
	</ul>
</div>
