<script lang="ts">
	import { Field, Panel } from '$lib/components/ui';
	import { zonedToUtc } from '$lib/timezone';

	let {
		reference = $bindable(''),
		approvedBy = $bindable(''),
		validFrom = $bindable(''),
		validUntil = $bindable(''),
		editAuth = $bindable(false),
		hasAuthDefault,
		timezone = 'UTC'
	}: {
		reference: string;
		approvedBy: string;
		validFrom: string;
		validUntil: string;
		editAuth: boolean;
		hasAuthDefault: boolean;
		timezone?: string;
	} = $props();

	const authUntil = $derived(
		validUntil
			? (zonedToUtc(validUntil, timezone) ?? new Date(NaN)).toLocaleDateString('fr-CH', {
					timeZone: timezone,
					day: 'numeric',
					month: 'long',
					year: 'numeric'
				})
			: ''
	);
</script>

<Panel>
	<div class="flex flex-col gap-4">
		<h2 class="rf-eyebrow">Autorisation écrite</h2>
		{#if hasAuthDefault && !editAuth}
			<input type="hidden" name="reference" value={reference} />
			<input type="hidden" name="approvedBy" value={approvedBy} />
			<input type="hidden" name="validFrom" value={validFrom} />
			<input type="hidden" name="validUntil" value={validUntil} />
			<div class="summary">
				<span class="summary-text">
					Autorisation reprise : réf. {reference}, approuvée par {approvedBy}, valable jusqu'au {authUntil}.
				</span>
				<button type="button" class="rf-link" onclick={() => (editAuth = true)}> Modifier </button>
			</div>
		{:else}
			<p class="text-ink-dim">Une autorisation valide est obligatoire avant tout envoi réel.</p>
			<div class="grid gap-4 sm:grid-cols-2">
				<Field
					label="Référence"
					name="reference"
					required
					placeholder="N° de mandat / contrat"
					bind:value={reference}
				/>
				<Field
					label="Approuvé par"
					name="approvedBy"
					required
					placeholder="Nom du responsable"
					bind:value={approvedBy}
				/>
				<Field label={`Valide du (${timezone})`} id="field-validFrom">
					{#snippet input()}
						<input
							id="field-validFrom"
							name="validFrom"
							type="datetime-local"
							required
							class="rf-input w-full max-w-full min-w-0"
							bind:value={validFrom}
						/>
					{/snippet}
				</Field>
				<Field label={`Jusqu'au (${timezone})`} id="field-validUntil">
					{#snippet input()}
						<input
							id="field-validUntil"
							name="validUntil"
							type="datetime-local"
							required
							class="rf-input w-full max-w-full min-w-0"
							bind:value={validUntil}
						/>
					{/snippet}
				</Field>
			</div>
		{/if}
	</div>
</Panel>

<style>
	.summary {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		min-width: 0;
		background: var(--c-surface-2);
		border: 1px solid var(--c-line-strong);
		border-radius: var(--r-btn);
		padding: 0.5rem 0.75rem;
		font-size: 0.8125rem;
	}
	.summary-text {
		min-width: 0;
		overflow-wrap: anywhere;
		color: var(--c-ink);
	}
	.summary button {
		flex: none;
		padding: 0.375rem 0;
		background: none;
		border: 0;
		cursor: pointer;
	}
</style>
