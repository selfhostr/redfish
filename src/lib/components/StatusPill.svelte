<script lang="ts">
	import Plate from './ui/Plate.svelte';

	let { status }: { status: string } = $props();

	type Variant = 'signal' | 'advisory' | 'warning' | 'info' | 'neutral';

	// Source : src/lib/server/db/schema.ts, enum campaigns.status
	// ('draft' | 'scheduled' | 'sending' | 'paused' | 'completed').
	const map: Record<string, { label: string; variant: Variant }> = {
		draft: { label: 'Brouillon', variant: 'neutral' },
		scheduled: { label: 'Programmée', variant: 'advisory' },
		sending: { label: 'En cours', variant: 'info' },
		paused: { label: 'En pause', variant: 'warning' },
		completed: { label: 'Terminée', variant: 'signal' }
	};

	const s = $derived(map[status] ?? { label: status || 'n/d', variant: 'neutral' as Variant });
</script>

<Plate variant={s.variant}>{s.label}</Plate>
