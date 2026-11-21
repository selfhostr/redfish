<script lang="ts">
	import { TEMPLATE_PLACEHOLDERS, type TemplateField } from '$lib/scenarios/placeholders';

	// Barre d'insertion des variables valides pour un gabarit. Insère `{{clé}}` au
	// curseur du champ cible (en remplaçant la sélection), puis émet un événement
	// `input` pour que `bind:value` reflète la modification.
	type Props = {
		field: TemplateField;
		target: HTMLTextAreaElement | HTMLInputElement | undefined;
		/** Libellé accessible du groupe de boutons. */
		label: string;
		/** Si fourni, affiche « Repartir du modèle ». */
		onreset?: () => void;
	};

	let { field, target, label, onreset }: Props = $props();

	const placeholders = $derived(TEMPLATE_PLACEHOLDERS[field]);

	function insert(key: string) {
		if (!target) return;
		const text = `{{${key}}}`;
		const start = target.selectionStart ?? target.value.length;
		const end = target.selectionEnd ?? start;
		target.focus();
		target.setRangeText(text, start, end, 'end');
		target.dispatchEvent(new Event('input', { bubbles: true }));
	}
</script>

<div class="toolbar" role="toolbar" aria-label={label}>
	{#each placeholders as p (p.key)}
		<button
			type="button"
			class="chip"
			title={p.hint}
			aria-label={`Insérer {{${p.key}}} : ${p.hint}`}
			onclick={() => insert(p.key)}
		>
			{`{{${p.key}}}`}
		</button>
	{/each}
	{#if onreset}
		<button
			type="button"
			class="chip reset"
			title="Remplacer ce gabarit par le squelette neutre d'origine"
			onclick={onreset}
		>
			Repartir du modèle
		</button>
	{/if}
</div>

<style>
	.toolbar {
		display: flex;
		flex-wrap: wrap;
		gap: 0.375rem;
	}

	.chip {
		font-family: var(--font-mono);
		font-size: 0.6875rem;
		line-height: 1.4;
		padding: 0.125rem 0.5rem;
		border: 1px solid var(--c-line);
		border-radius: var(--r-btn);
		background: var(--c-surface-2);
		color: var(--c-ink-dim);
		cursor: pointer;
	}

	.chip:hover {
		color: var(--c-ink);
		border-color: var(--c-line-strong);
	}

	.chip:focus-visible {
		outline: 2px solid var(--c-ink);
		outline-offset: 1px;
	}

	.reset {
		font-family: var(--font-ui);
		margin-left: auto;
		background: transparent;
	}
</style>
