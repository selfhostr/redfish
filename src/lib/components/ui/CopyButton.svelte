<script lang="ts">
	import Button from './Button.svelte';
	import { toast } from './toast.svelte';

	type Props = {
		value: string;
		/** Ce qui est copié, pour le libellé d'accessibilité (ex. « l'identifiant »). */
		what?: string;
		label?: string;
		size?: 'sm' | 'md';
	};
	let { value, what = 'la valeur', label = 'Copier', size = 'sm' }: Props = $props();

	async function copy() {
		try {
			await navigator.clipboard.writeText(value);
			toast('Copié', 'signal');
		} catch {
			toast('Copie impossible, sélectionnez le texte manuellement', 'warning');
		}
	}
</script>

<Button type="button" variant="ghost" {size} aria-label="Copier {what}" onclick={copy}>
	{label}
</Button>
