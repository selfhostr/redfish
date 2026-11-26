<script lang="ts">
	import type { Snippet } from 'svelte';

	type Props = {
		/** Étiquette (texte normal, discret). */
		label?: string;
		id?: string;
		name?: string;
		placeholder?: string;
		required?: boolean;
		/** Texte d'aide affiché sous le champ. */
		help?: string;
		/** Message d'erreur (prend le pas sur l'aide, en mots actionnables). */
		error?: string;
		/** Valeur liée (`bind:value`) si aucun slot `input` n'est fourni. */
		value?: string;
		/** Slot pour fournir son propre contrôle (select, textarea…). */
		input?: Snippet;
		class?: string;
		[key: string]: unknown;
	};

	let {
		label,
		id,
		name,
		placeholder,
		required = false,
		help,
		error,
		value = $bindable(''),
		input,
		class: klass = '',
		...rest
	}: Props = $props();

	const fieldId = $derived(id ?? (name ? `field-${name}` : undefined));
	const msgId = $derived(fieldId ? `${fieldId}-msg` : undefined);
</script>

<div class="field {klass}">
	{#if label}
		<label class="field-label" for={fieldId}>{label}</label>
	{/if}

	{#if input}
		{@render input()}
	{:else}
		<!-- `type` littéral statique (requis avec bind:value), surchargé par {...rest}. -->
		<input
			class="field-input"
			id={fieldId}
			{name}
			type="text"
			{placeholder}
			{required}
			aria-invalid={error ? 'true' : undefined}
			aria-describedby={error || help ? msgId : undefined}
			bind:value
			{...rest}
		/>
	{/if}

	{#if error}
		<p class="field-msg error" id={msgId}>{error}</p>
	{:else if help}
		<p class="field-msg help" id={msgId}>{help}</p>
	{/if}
</div>

<style>
	.field {
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
	}

	.field-label {
		font-size: 0.75rem;
		font-weight: 500;
		color: var(--c-ink-dim);
	}

	.field-input {
		width: 100%;
		background: var(--c-surface-2);
		border: 1px solid var(--c-line-strong);
		border-radius: var(--r-btn);
		min-height: var(--control-h);
		padding: 0.4375rem 0.75rem;
		font-family: var(--font-ui);
		font-size: 0.8125rem;
		line-height: 1.4;
		color: var(--c-ink);
		transition: border-color 0.12s ease;
	}
	.field-input::placeholder {
		color: var(--c-ink-dim);
	}
	.field-input:focus {
		outline: none;
		border-color: var(--c-ink-dim);
	}
	.field-input:focus-visible {
		outline: 2px solid var(--c-ink);
		outline-offset: 2px;
	}
	.field-input[aria-invalid='true'] {
		border-color: var(--c-warning);
	}

	.field {
		min-width: 0;
	}
	.field-label,
	.field-msg {
		overflow-wrap: anywhere;
	}

	.field-msg {
		font-size: 0.75rem;
		line-height: 1.4;
	}
	.field-msg.help {
		color: var(--c-ink-dim);
	}
	.field-msg.error {
		color: var(--c-warning);
	}
</style>
