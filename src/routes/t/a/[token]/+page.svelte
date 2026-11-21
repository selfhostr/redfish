<script lang="ts">
	import type { PageData } from './$types';

	// La page de sensibilisation, rendue côté serveur, est insérée telle quelle.
	let { data }: { data: PageData } = $props();
</script>

<!-- eslint-disable-next-line svelte/no-at-html-tags -->
{@html data.html}
