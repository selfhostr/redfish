<script lang="ts">
	import { Panel } from '$lib/components/ui';
	import { categoryLabel, difficultyLabel, localeLabel } from '$lib/scenario-labels';

	type ScenarioOption = {
		id: string;
		key: string;
		title: string;
		category: string;
		difficulty: string;
		locale: string;
	};

	let {
		scenarios,
		scenarioId,
		onpick
	}: { scenarios: ScenarioOption[]; scenarioId: string; onpick: (id: string) => void } = $props();

	const hasScenarios = $derived(scenarios.length > 0);
	const meta = (s: ScenarioOption) =>
		[categoryLabel(s.category), difficultyLabel(s.difficulty), localeLabel(s.locale)].join(' · ');
</script>

<Panel>
	<fieldset class="flex min-w-0 flex-col gap-3">
		<legend class="rf-eyebrow mb-3">Scénario</legend>
		{#if hasScenarios}
			<div class="flex flex-col gap-2" role="radiogroup" aria-label="Scénario">
				{#each scenarios as s, i (s.id)}
					<div class="card" class:selected={scenarioId === s.id}>
						<label class="card-main">
							<input
								type="radio"
								name="scenarioId"
								value={s.id}
								required={i === 0}
								checked={scenarioId === s.id}
								onchange={() => onpick(s.id)}
							/>
							<span class="card-title">{s.title}</span>
							<span class="card-meta">{meta(s)}</span>
						</label>
						<a
							href="/scenarios/{s.key}"
							target="_blank"
							rel="noopener"
							class="rf-link card-preview"
							aria-label="Aperçu du scénario {s.title}"
						>
							Aperçu
						</a>
					</div>
				{/each}
			</div>
		{:else}
			<p class="rounded-md bg-surface-2 px-3 py-2 text-ink-dim">
				Aucun scénario disponible. Chargez un scénario côté serveur avant de créer une campagne.
			</p>
		{/if}
	</fieldset>
</Panel>

<style>
	.card {
		display: flex;
		align-items: stretch;
		gap: 0.75rem;
		min-width: 0;
		background: var(--c-surface-2);
		border: 1px solid var(--c-line-strong);
		border-radius: var(--r-btn);
		padding-right: 0.875rem;
	}
	.card.selected {
		border-color: var(--c-ink);
	}
	.card:has(input:focus-visible) {
		outline: 2px solid var(--c-ink);
		outline-offset: 2px;
	}
	.card-main {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 0.125rem;
		padding: 0.75rem 0 0.75rem 0.875rem;
		cursor: pointer;
		position: relative;
	}
	.card-main input {
		position: absolute;
		opacity: 0;
		inset: 0;
		margin: 0;
		cursor: pointer;
	}
	.card-title {
		font-weight: 500;
		color: var(--c-ink);
		overflow-wrap: anywhere;
	}
	.card-meta {
		font-size: 0.75rem;
		color: var(--c-ink-dim);
	}
	.card-preview {
		align-self: center;
		font-size: 0.8125rem;
		padding: 0.5rem 0;
	}
</style>
