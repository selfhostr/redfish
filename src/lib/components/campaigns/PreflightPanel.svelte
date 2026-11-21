<script lang="ts">
	import { Panel, Plate } from '$lib/components/ui';
	import type { PreflightReport, PreflightSection } from '$lib/server/campaigns/preflight';

	let { report }: { report: PreflightReport } = $props();

	const titles: Record<PreflightSection, string> = {
		targets: 'Cibles',
		profile: 'Profil d’envoi',
		scenario: 'Scénario',
		schedule: 'Autorisation et calendrier',
		tracking: 'Tracking'
	};
	const sections = Object.keys(titles) as PreflightSection[];
	const variant = { error: 'signal', warning: 'advisory', info: 'neutral' } as const;
	const label = { error: 'Erreur', warning: 'Avertissement', info: 'OK' } as const;
</script>

<Panel>
	{#snippet header()}
		<h2 class="rf-eyebrow">Contrôle avant lancement</h2>
		{#if report.ok}
			<Plate variant={report.warnings > 0 ? 'advisory' : 'info'}>
				{report.warnings > 0 ? `${report.warnings} avertissement(s)` : 'Prête'}
			</Plate>
		{:else}
			<Plate variant="signal">{report.errors} erreur(s) bloquante(s)</Plate>
		{/if}
	{/snippet}
	<div class="flex flex-col gap-4" data-testid="preflight">
		<p class="text-ink-dim">
			{report.sendable} destinataire(s) sur {report.total}
			{#if report.excluded.anonymized + report.excluded.invalid > 0}
				· exclus : {report.excluded.anonymized} anonymisé(s), {report.excluded.invalid} invalide(s)
			{/if}
		</p>
		{#each sections as sec (sec)}
			{@const rows = report.items.filter((i) => i.section === sec)}
			{#if rows.length > 0}
				<div class="flex flex-col gap-1.5">
					<h3 class="field-label">{titles[sec]}</h3>
					<ul class="flex flex-col gap-1.5">
						{#each rows as r, i (i)}
							<li class="flex items-start gap-2">
								<span class="flex-none">
									<Plate variant={variant[r.severity]}>{label[r.severity]}</Plate>
								</span>
								<span class="min-w-0 text-ink [overflow-wrap:anywhere]">{r.message}</span>
							</li>
						{/each}
					</ul>
				</div>
			{/if}
		{/each}
		{#if !report.ok}
			<p class="text-ink-dim">
				Le lancement est bloqué tant que les erreurs ne sont pas corrigées.
			</p>
		{/if}
	</div>
</Panel>

<style>
	.field-label {
		font-family: var(--font-mono);
		text-transform: uppercase;
		font-size: 0.6875rem;
		letter-spacing: 0.04em;
		color: var(--c-ink-dim);
	}
</style>
