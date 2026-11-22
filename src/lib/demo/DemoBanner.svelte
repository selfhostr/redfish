<script lang="ts">
	/** The mark of the static demo, above every page: fictional data, nothing saved or sent. */
</script>

<div class="demo-banner" role="note" data-testid="demo-banner">
	<span class="dot" aria-hidden="true"></span>
	<strong>Démo, données fictives</strong>
	<span class="dim">Rien n'est enregistré ni envoyé : les modifications sont désactivées.</span>
	<a href="https://github.com/selfhostr/redfish" rel="noopener">Installer redfish</a>
</div>

<style>
	.demo-banner {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: center;
		gap: 0.25rem 0.75rem;
		padding: 0.4rem 1rem;
		font-size: 0.8125rem;
		line-height: 1.4;
		color: var(--c-ink);
		background: var(--c-advisory-bg);
		border-bottom: 1px solid color-mix(in srgb, var(--c-advisory) 35%, transparent);
	}
	.dot {
		width: 0.5rem;
		height: 0.5rem;
		border-radius: 999px;
		background: var(--c-advisory);
	}
	.dim {
		color: var(--c-ink-dim);
	}
	a {
		color: var(--c-ink);
		text-decoration: underline;
	}
</style>
