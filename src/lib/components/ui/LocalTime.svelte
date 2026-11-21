<script lang="ts">
	import { onMount } from 'svelte';

	// SSR et première hydratation : texte UTC déterministe. Après montage :
	// format local fr-CH avec fuseau abrégé (title = heure UTC). Aucun écart d'hydratation.
	type Props = {
		value: Date | string | number | null | undefined;
		mode?: 'datetime' | 'date';
		class?: string;
	};
	let { value, mode = 'datetime', class: klass = '' }: Props = $props();

	let mounted = $state(false);
	onMount(() => {
		mounted = true;
	});

	const date = $derived.by(() => {
		if (value === null || value === undefined || value === '') return null;
		const d = value instanceof Date ? value : new Date(value);
		return Number.isNaN(d.getTime()) ? null : d;
	});

	const p = (n: number) => String(n).padStart(2, '0');
	const utc = $derived(
		date
			? `${p(date.getUTCDate())}.${p(date.getUTCMonth() + 1)}.${date.getUTCFullYear()}` +
					(mode === 'datetime' ? ` ${p(date.getUTCHours())}:${p(date.getUTCMinutes())} UTC` : '')
			: ''
	);
	const local = $derived(
		date && mounted
			? new Intl.DateTimeFormat(
					'fr-CH',
					mode === 'datetime'
						? {
								year: '2-digit',
								month: '2-digit',
								day: '2-digit',
								hour: '2-digit',
								minute: '2-digit',
								timeZoneName: 'short'
							}
						: { dateStyle: 'short' }
				).format(date)
			: ''
	);
</script>

{#if date}
	<time datetime={date.toISOString()} class={klass} title={mounted ? utc : undefined}>
		{mounted ? local : utc}
	</time>
{:else}
	<span class={klass}>n/d</span>
{/if}
