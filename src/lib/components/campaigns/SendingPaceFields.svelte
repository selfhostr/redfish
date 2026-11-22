<script lang="ts">
	import { Field } from '$lib/components/ui';

	// Rythme d'envoi : tout d'un coup, ou étalé sur une durée (heures ou jours),
	// éventuellement aux heures ouvrées du client. Champs lus par parseSendingPace.
	let {
		spreadHours = null,
		workingHoursOnly = false,
		workStartHour = 8,
		workEndHour = 18,
		timezone = 'UTC'
	}: {
		spreadHours?: number | null;
		workingHoursOnly?: boolean;
		workStartHour?: number;
		workEndHour?: number;
		timezone?: string;
	} = $props();

	/* svelte-ignore state_referenced_locally */
	const inDays = spreadHours !== null && spreadHours % 24 === 0;
	/* svelte-ignore state_referenced_locally */
	let mode = $state<'all' | 'spread'>(spreadHours ? 'spread' : 'all');
	/* svelte-ignore state_referenced_locally */
	let amount = $state(spreadHours ? String(inDays ? spreadHours / 24 : spreadHours) : '2');
	/* svelte-ignore state_referenced_locally */
	let unit = $state<'hours' | 'days'>(spreadHours ? (inDays ? 'days' : 'hours') : 'days');
	/* svelte-ignore state_referenced_locally */
	let working = $state(workingHoursOnly);
	/* svelte-ignore state_referenced_locally */
	let startHour = $state(String(workStartHour));
	/* svelte-ignore state_referenced_locally */
	let endHour = $state(String(workEndHour));

	const hours = Array.from({ length: 24 }, (_, h) => h);
</script>

<fieldset class="flex flex-col gap-3">
	<legend class="field-label">Rythme d'envoi</legend>
	<label class="flex items-center gap-2 text-ink">
		<input type="radio" name="sendMode" value="all" bind:group={mode} />
		Tout envoyer d'un coup
	</label>
	<label class="flex items-center gap-2 text-ink">
		<input type="radio" name="sendMode" value="spread" bind:group={mode} />
		Étaler les envois, dans un ordre aléatoire
	</label>

	{#if mode === 'spread'}
		<div class="flex flex-col gap-3 border-l border-line-strong pl-4">
			<div class="flex flex-wrap items-end gap-3">
				<Field label="Durée" id="field-spreadAmount">
					{#snippet input()}
						<input
							id="field-spreadAmount"
							name="spreadAmount"
							type="number"
							min="1"
							max={unit === 'days' ? 30 : 720}
							step="1"
							required
							class="rf-input w-24"
							bind:value={amount}
						/>
					{/snippet}
				</Field>
				<Field label="Unité" id="field-spreadUnit">
					{#snippet input()}
						<select id="field-spreadUnit" name="spreadUnit" class="rf-input" bind:value={unit}>
							<option value="hours">heures</option>
							<option value="days">jours</option>
						</select>
					{/snippet}
				</Field>
			</div>
			<label class="flex items-center gap-2 text-ink">
				<input type="checkbox" name="workingHoursOnly" bind:checked={working} />
				Uniquement aux heures ouvrées (lundi à vendredi)
			</label>
			{#if working}
				<div class="flex flex-wrap items-end gap-3">
					<Field label="De" id="field-workStartHour">
						{#snippet input()}
							<select
								id="field-workStartHour"
								name="workStartHour"
								class="rf-input"
								bind:value={startHour}
							>
								{#each hours as h (h)}<option value={String(h)}>{h} h</option>{/each}
							</select>
						{/snippet}
					</Field>
					<Field label="À" id="field-workEndHour">
						{#snippet input()}
							<select
								id="field-workEndHour"
								name="workEndHour"
								class="rf-input"
								bind:value={endHour}
							>
								{#each hours as h (h)}<option value={String(h)}>{h} h</option>{/each}
							</select>
						{/snippet}
					</Field>
				</div>
			{/if}
			<p class="text-ink-dim">
				Chaque destinataire reçoit l'e-mail à un moment tiré au hasard dans la fenêtre, qui commence
				au lancement{working ? ' (ou à la prochaine ouverture)' : ''}. Heures en {timezone}.
				L'autorisation doit couvrir toute la fenêtre.
			</p>
		</div>
	{/if}
</fieldset>

<style>
	.field-label {
		font-family: var(--font-mono);
		text-transform: uppercase;
		font-size: 0.6875rem;
		letter-spacing: 0.04em;
		color: var(--c-ink-dim);
		margin-bottom: 0.25rem;
	}
</style>
