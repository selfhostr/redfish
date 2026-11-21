<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button, ErrorNotice, Panel } from '$lib/components/ui';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	// Repli sur les valeurs soumises (formulaire refusé) puis sur les squelettes.
	const v = $derived(
		form && 'values' in form && form.values ? form.values : data.defaults
	) as typeof data.defaults;

	let saving = $state(false);
</script>

<main class="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-6 md:px-6 md:py-8">
	<div class="flex flex-wrap items-center justify-between gap-3">
		<h1 class="text-2xl font-semibold text-ink">Créer un scénario</h1>
		<Button href="/scenarios" variant="ghost">Retour</Button>
	</div>

	<p class="text-ink-dim">
		Composez un scénario. Les gabarits sont pré-remplis avec des squelettes neutres : adaptez le
		texte, puis enregistrez. Le contenu est validé (notamment l'invariant « zéro capture » de la
		page) avant d'être stocké.
	</p>

	{#if form?.error}
		<ErrorNotice message={form.error} />
	{/if}

	<form
		method="POST"
		use:enhance={() => {
			saving = true;
			return async ({ update }) => {
				await update();
				saving = false;
			};
		}}
		class="flex flex-col gap-6"
	>
		<Panel>
			<div class="grid gap-4 md:grid-cols-2">
				<label class="flex flex-col gap-1.5">
					<span class="rf-label">Clé</span>
					<input
						class="rf-input font-mono"
						name="key"
						value={v.key}
						placeholder="mon-scenario"
						required
					/>
				</label>
				<label class="flex flex-col gap-1.5">
					<span class="rf-label">Titre</span>
					<input class="rf-input" name="title" value={v.title} required />
				</label>
				<label class="flex flex-col gap-1.5">
					<span class="rf-label">Catégorie</span>
					<select class="rf-input" name="category" value={v.category}>
						<option value="other">Autre</option>
						<option value="credential-harvest">Collecte d'identifiants</option>
						<option value="payment-fraud">Fraude au paiement</option>
					</select>
				</label>
				<label class="flex flex-col gap-1.5">
					<span class="rf-label">Langue</span>
					<select class="rf-input" name="locale" value={v.locale}>
						<option value="fr">Français</option>
						<option value="de">Allemand</option>
						<option value="it">Italien</option>
						<option value="en">Anglais</option>
					</select>
				</label>
				<label class="flex flex-col gap-1.5">
					<span class="rf-label">Difficulté</span>
					<select class="rf-input" name="difficulty" value={v.difficulty}>
						<option value="easy">Facile</option>
						<option value="medium">Moyenne</option>
						<option value="hard">Difficile</option>
					</select>
				</label>
				<label class="flex flex-col gap-1.5">
					<span class="rf-label">Nom d'expéditeur</span>
					<input class="rf-input" name="fromName" value={v.fromName} placeholder="Facultatif" />
				</label>
				<label class="flex flex-col gap-1.5 md:col-span-2">
					<span class="rf-label">Sujet de l'e-mail</span>
					<input class="rf-input" name="subject" value={v.subject} required />
				</label>
			</div>
		</Panel>

		<Panel>
			<div class="flex flex-col gap-4">
				<label class="flex flex-col gap-1.5">
					<span class="rf-label">E-mail (MJML)</span>
					<textarea
						class="rf-input editor"
						name="email"
						rows="12"
						spellcheck="false"
						value={v.email}></textarea>
				</label>
				<label class="flex flex-col gap-1.5">
					<span class="rf-label">Page de destination (HTML)</span>
					<textarea
						class="rf-input editor"
						name="landing"
						rows="14"
						spellcheck="false"
						value={v.landing}></textarea>
					<span class="text-xs text-ink-dim">
						Invariant « zéro capture » : le formulaire poste vers {'{{submitUrl}}'}, aucun champ ne
						porte d'attribut name, et le beacon navigator.sendBeacon('{'{{beaconUrl}}'}') signale
						uniquement l'affichage.
					</span>
				</label>
				<label class="flex flex-col gap-1.5">
					<span class="rf-label">Page de sensibilisation (HTML)</span>
					<textarea
						class="rf-input editor"
						name="awareness"
						rows="10"
						spellcheck="false"
						value={v.awareness}></textarea>
				</label>
			</div>
		</Panel>

		<div class="flex items-center gap-2">
			<Button type="submit" variant="primary" disabled={saving}>
				{saving ? 'Enregistrement...' : 'Créer le scénario'}
			</Button>
			<Button href="/scenarios" variant="ghost">Annuler</Button>
		</div>
	</form>
</main>

<style>
	.editor {
		font-family: var(--font-mono);
		font-size: 0.75rem;
		line-height: 1.5;
		resize: vertical;
		min-height: 8rem;
	}
</style>
