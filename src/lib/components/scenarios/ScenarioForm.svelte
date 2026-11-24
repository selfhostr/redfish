<script lang="ts" module>
	export interface ScenarioFormValues {
		key: string;
		title: string;
		category: string;
		locale: string;
		difficulty: string;
		subject: string;
		fromName: string;
		email: string;
		landing: string;
		awareness: string;
	}

	export interface ScenarioFormState {
		error?: string;
		values?: ScenarioFormValues;
	}
</script>

<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { enhance } from '$app/forms';
	import PlaceholderToolbar from '$lib/components/editor/PlaceholderToolbar.svelte';
	import WebmailPreview from '$lib/components/preview/WebmailPreview.svelte';
	import { Button, ErrorNotice, Panel, Plate, Skeleton } from '$lib/components/ui';
	import type { TemplateField } from '$lib/scenarios/placeholders';
	import { SKELETON_AWARENESS, SKELETON_EMAIL, SKELETON_LANDING } from '$lib/scenarios/skeletons';

	let {
		initial,
		form = null,
		submitLabel,
		keyReadonly = false,
		cancelHref = '/scenarios'
	}: {
		initial: ScenarioFormValues;
		form?: ScenarioFormState | null;
		submitLabel: string;
		keyReadonly?: boolean;
		cancelHref?: string;
	} = $props();

	type Values = ScenarioFormValues;

	// Valeurs initiales : celles soumises (formulaire refusé, sans JS) puis les
	// valeurs fournies. Ensuite, l'état local fait foi (bind:value).
	const resolve = (): Values => ({
		...((form && 'values' in form && form.values ? form.values : initial) as Values)
	});
	let fields = $state(resolve());

	let saving = $state(false);

	// ---- Aperçu en direct -------------------------------------------------
	type Preview = {
		subject: string;
		fromName: string;
		fromAddress: string;
		recipient: { firstName: string; lastName: string; email: string };
		receivedAt: string;
		emailHtml: string;
		landingHtml: string;
		awarenessHtml: string;
	};
	type Issue = { field: TemplateField; message: string; details?: string[] };

	const DEBOUNCE_MS = 500;

	let preview = $state<Preview | null>(null);
	let issues = $state<Issue[]>([]);
	let previewError = $state<string | null>(null);
	let pending = $state(false);
	let mounted = $state(false);

	let controller: AbortController | null = null;

	async function refresh(snapshot: Values) {
		controller?.abort();
		const ctl = new AbortController();
		controller = ctl;
		const body = new FormData();
		for (const [k, val] of Object.entries(snapshot)) body.set(k, String(val ?? ''));
		try {
			const res = await fetch('/scenarios/new/preview', {
				method: 'POST',
				body,
				signal: ctl.signal
			});
			if (!res.ok) {
				const msg = await res
					.json()
					.then((j: { message?: string }) => j.message)
					.catch(() => undefined);
				throw new Error(msg ?? `Erreur ${res.status}`);
			}
			const out = (await res.json()) as { preview: Preview; issues: Issue[] };
			if (controller !== ctl) return;
			preview = out.preview;
			issues = out.issues;
			previewError = null;
		} catch (e) {
			if (ctl.signal.aborted) return;
			previewError = e instanceof Error ? e.message : 'Aperçu indisponible.';
		} finally {
			if (controller === ctl) pending = false;
		}
	}

	onMount(() => {
		mounted = true;
		return () => controller?.abort();
	});

	$effect(() => {
		if (!mounted) return;
		// Lecture de tous les champs : toute frappe relance le minuteur.
		const snapshot = { ...fields };
		pending = true;
		// Premier rendu immédiat, puis anti-rebond (`untrack` : la réception d'un
		// aperçu ne doit pas relancer l'effet).
		const delay = untrack(() => (preview ? DEBOUNCE_MS : 0));
		const timer = setTimeout(() => refresh(snapshot), delay);
		return () => clearTimeout(timer);
	});

	const issuesFor = (field: TemplateField) => issues.filter((i) => i.field === field);

	// ---- Outils d'édition ------------------------------------------------
	let subjectEl = $state<HTMLInputElement>();
	let emailEl = $state<HTMLTextAreaElement>();
	let landingEl = $state<HTMLTextAreaElement>();
	let awarenessEl = $state<HTMLTextAreaElement>();

	const SKELETONS = {
		email: SKELETON_EMAIL,
		landing: SKELETON_LANDING,
		awareness: SKELETON_AWARENESS
	} as const;

	function resetTemplate(field: keyof typeof SKELETONS) {
		if (fields[field] === SKELETONS[field]) return;
		if (
			!confirm('Remplacer ce gabarit par le squelette neutre ? Vos modifications seront perdues.')
		)
			return;
		fields[field] = SKELETONS[field];
	}
</script>

{#if form?.error}
	<ErrorNotice message={form.error} />
{/if}

<div class="grid items-start gap-6 lg:grid-cols-2">
	<form
		method="POST"
		use:enhance={() => {
			saving = true;
			return async ({ update }) => {
				await update({ reset: false });
				saving = false;
			};
		}}
		class="flex min-w-0 flex-col gap-6"
	>
		<Panel>
			<div class="grid gap-4 md:grid-cols-2">
				<label class="flex flex-col gap-1.5">
					<span class="rf-label">Clé</span>
					<input
						class="rf-input font-mono"
						name="key"
						bind:value={fields.key}
						placeholder="mon-scenario"
						readonly={keyReadonly}
						aria-readonly={keyReadonly}
						required
					/>
				</label>
				<label class="flex flex-col gap-1.5">
					<span class="rf-label">Titre</span>
					<input class="rf-input" name="title" bind:value={fields.title} required />
				</label>
				<label class="flex flex-col gap-1.5">
					<span class="rf-label">Catégorie</span>
					<select class="rf-input" name="category" bind:value={fields.category}>
						<option value="other">Autre</option>
						<option value="credential-harvest">Collecte d'identifiants</option>
						<option value="payment-fraud">Fraude au paiement</option>
					</select>
				</label>
				<label class="flex flex-col gap-1.5">
					<span class="rf-label">Langue</span>
					<select class="rf-input" name="locale" bind:value={fields.locale}>
						<option value="fr">Français</option>
						<option value="de">Allemand</option>
						<option value="it">Italien</option>
						<option value="en">Anglais</option>
					</select>
				</label>
				<label class="flex flex-col gap-1.5">
					<span class="rf-label">Difficulté</span>
					<select class="rf-input" name="difficulty" bind:value={fields.difficulty}>
						<option value="easy">Facile</option>
						<option value="medium">Moyenne</option>
						<option value="hard">Difficile</option>
					</select>
				</label>
				<label class="flex flex-col gap-1.5">
					<span class="rf-label">Nom d'expéditeur</span>
					<input
						class="rf-input"
						name="fromName"
						bind:value={fields.fromName}
						placeholder="Facultatif"
					/>
					<span class="text-xs text-ink-dim">
						Nom affiché de l'expéditeur pour ce scénario (ex. « Service informatique »). Laissé
						vide, c'est le nom du profil d'envoi qui s'applique. L'adresse e-mail provient toujours
						du profil d'envoi.
					</span>
				</label>
				<div class="flex flex-col gap-1.5 md:col-span-2">
					<label class="rf-label" for="field-subject">Sujet de l'e-mail</label>
					<input
						id="field-subject"
						class="rf-input"
						name="subject"
						bind:value={fields.subject}
						bind:this={subjectEl}
						required
					/>
					<PlaceholderToolbar field="subject" target={subjectEl} label="Variables du sujet" />
					{@render fieldIssues('subject')}
				</div>
			</div>
		</Panel>

		<Panel>
			<div class="flex flex-col gap-5">
				<div class="flex flex-col gap-1.5">
					<label class="rf-label" for="field-email">E-mail (MJML)</label>
					<PlaceholderToolbar
						field="email"
						target={emailEl}
						label="Variables de l'e-mail"
						onreset={() => resetTemplate('email')}
					/>
					<textarea
						id="field-email"
						class="rf-input editor"
						name="email"
						rows="12"
						spellcheck="false"
						bind:value={fields.email}
						bind:this={emailEl}></textarea>
					{@render fieldIssues('email')}
				</div>
				<div class="flex flex-col gap-1.5">
					<label class="rf-label" for="field-landing">Page de destination (HTML)</label>
					<PlaceholderToolbar
						field="landing"
						target={landingEl}
						label="Variables de la page de destination"
						onreset={() => resetTemplate('landing')}
					/>
					<textarea
						id="field-landing"
						class="rf-input editor"
						name="landing"
						rows="14"
						spellcheck="false"
						bind:value={fields.landing}
						bind:this={landingEl}></textarea>
					<span class="text-xs text-ink-dim">
						Invariant « zéro capture » : le formulaire poste vers {'{{submitUrl}}'}, aucun champ ne
						porte d'attribut name, et le beacon navigator.sendBeacon('{'{{beaconUrl}}'}') signale
						uniquement l'affichage.
					</span>
					{@render fieldIssues('landing')}
				</div>
				<div class="flex flex-col gap-1.5">
					<label class="rf-label" for="field-awareness">Page de sensibilisation (HTML)</label>
					<PlaceholderToolbar
						field="awareness"
						target={awarenessEl}
						label="Variables de la page de sensibilisation"
						onreset={() => resetTemplate('awareness')}
					/>
					<textarea
						id="field-awareness"
						class="rf-input editor"
						name="awareness"
						rows="10"
						spellcheck="false"
						bind:value={fields.awareness}
						bind:this={awarenessEl}></textarea>
					{@render fieldIssues('awareness')}
				</div>
			</div>
		</Panel>

		<div class="flex items-center gap-2">
			<Button type="submit" variant="primary" disabled={saving}>
				{saving ? 'Enregistrement...' : submitLabel}
			</Button>
			<Button href={cancelHref} variant="ghost">Annuler</Button>
		</div>
	</form>

	<section class="preview-col flex min-w-0 flex-col gap-4" aria-label="Aperçu en direct">
		<div class="flex flex-wrap items-center justify-between gap-3">
			<h2 class="rf-eyebrow">Aperçu en direct</h2>
			<span class="text-xs text-ink-dim" aria-live="polite">
				{#if pending}Mise à jour...{:else if previewError}Aperçu indisponible{:else if preview}À
					jour{/if}
			</span>
		</div>

		<p class="text-ink-dim">
			Rendu pour un destinataire fictif, sans lien actif ni envoi. Les problèmes détectés
			s'affichent ici pendant la saisie.
		</p>

		{#if previewError}
			<ErrorNotice title="L'aperçu n'a pas pu être généré" message={previewError} />
		{/if}

		{#if issues.length > 0}
			<Panel>
				<ul class="flex flex-col gap-3" aria-live="polite">
					{#each issues as issue, i (i)}
						<li class="flex flex-col gap-1.5">
							<div class="flex flex-wrap items-start gap-2">
								<Plate variant="warning">À corriger</Plate>
								<span class="min-w-0 flex-1 break-words text-ink">{issue.message}</span>
							</div>
							{#if issue.details?.length}
								<ul class="details">
									{#each issue.details as d, j (j)}
										<li>{d}</li>
									{/each}
								</ul>
							{/if}
						</li>
					{/each}
				</ul>
			</Panel>
		{:else if preview && !previewError}
			<div><Plate variant="info">Aucun problème détecté</Plate></div>
		{/if}

		{#if preview}
			<WebmailPreview {preview} />
		{:else}
			<Skeleton height="320px" />
		{/if}
	</section>
</div>

{#snippet fieldIssues(field: TemplateField)}
	{#each issuesFor(field) as issue, i (i)}
		<span class="text-xs text-warning">{issue.message}</span>
	{/each}
{/snippet}

<style>
	.editor {
		font-family: var(--font-mono);
		font-size: 0.75rem;
		line-height: 1.5;
		resize: vertical;
		min-height: 8rem;
	}

	.details {
		margin: 0;
		padding: 0.5rem 0.75rem;
		list-style: none;
		font-family: var(--font-mono);
		font-size: 0.6875rem;
		line-height: 1.5;
		color: var(--c-ink-dim);
		background: var(--c-surface-2);
		border-radius: var(--r-box);
		overflow-wrap: anywhere;
	}

	@media (min-width: 1024px) {
		.preview-col {
			position: sticky;
			top: 1rem;
			max-height: calc(100vh - 2rem);
			overflow-y: auto;
		}
	}
</style>
