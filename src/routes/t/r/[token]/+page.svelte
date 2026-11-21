<script lang="ts">
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head>
	<title>{data.title}</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<main
	lang={data.lang}
	style="max-width:32rem;margin:4rem auto;padding:0 1rem;font-family:sans-serif"
>
	<h1>{data.title}</h1>
	<p>{data.body}</p>
</main>
