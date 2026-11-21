<script lang="ts">
	import type { PageData } from './$types';

	// Le gabarit d'atterrissage, rendu côté serveur, est inséré tel quel. Ses
	// propriétés « zéro capture » (champs sans `name`, beacon sans corps) sont
	// garanties par le gabarit lui-même ; rien de saisi n'est jamais lu.
	let { data }: { data: PageData } = $props();
</script>

<!-- eslint-disable-next-line svelte/no-at-html-tags -->
{@html data.html}
