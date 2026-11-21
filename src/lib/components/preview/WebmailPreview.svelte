<script lang="ts">
	import { onMount } from 'svelte';
	import { Button, LocalTime, Panel, Plate, Skeleton, Tabs } from '$lib/components/ui';
	import { decideNav, PREVIEW_MARKER_ATTR } from '$lib/preview-nav';
	import type { PreviewStep } from '$lib/preview-nav';

	// Faux webmail 100 % visuel : aucune donnée réelle, aucune soumission, aucun
	// appel réseau. Les documents des iframes sont assainis côté serveur (aucun
	// href, éléments actifs marqués `data-rf-preview`) ; ici on ajoute le sandbox,
	// puis l'interception des clics depuis le parent.
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

	type Props = { preview: Preview };
	let { preview }: Props = $props();

	const STEPS = [
		{ id: 'inbox', label: 'Boîte de réception' },
		{ id: 'email', label: 'E-mail' },
		{ id: 'landing', label: 'Page de destination' },
		{ id: 'awareness', label: 'Page de sensibilisation' }
	];
	const MAX_HEIGHT = 1400;
	const MIN_HEIGHT = 240;

	let step = $state('inbox');
	// Les iframes ne sont rendues qu'après le montage, quand l'interception des clics
	// est opérationnelle (le HTML d'aperçu ne contient de toute façon aucun href :
	// une URL `#...` d'un srcdoc se résoudrait contre l'URL du dashboard).
	let mounted = $state(false);

	const cleanups = new Set<() => void>();
	const attached = new WeakMap<HTMLIFrameElement, () => void>();

	onMount(() => {
		mounted = true;
		return () => {
			for (const c of cleanups) c();
			cleanups.clear();
		};
	});

	function go(next: PreviewStep) {
		if (next !== 'none') step = next;
	}

	/** Élément visé par un événement venu de l'iframe. */
	function eventElement(event: Event): Element | null {
		// Le document de l'iframe est un autre realm : `instanceof Element` y est
		// toujours faux. Test par nodeType, indépendant du realm.
		const node = event.target as Node | null;
		if (!node || typeof node.nodeType !== 'number') return null;
		return node.nodeType === 1 ? (node as Element) : node.parentElement;
	}

	/** Intercepte clics et soumissions dans le document de l'iframe (phase capture). */
	function attach(frame: HTMLIFrameElement) {
		attached.get(frame)?.();
		const doc = frame.contentDocument;
		if (!doc) return;

		const onClick = (event: Event) => {
			// Aucune action par défaut, quel que soit l'élément (lien, area, bouton…).
			event.preventDefault();
			if (event.type !== 'click') return;
			const el = eventElement(event)?.closest(`[${PREVIEW_MARKER_ATTR}]`);
			if (!el) return;
			go(
				decideNav({
					tag: el.tagName.toLowerCase(),
					marker: el.getAttribute(PREVIEW_MARKER_ATTR),
					type: el.getAttribute('type'),
					insideForm: el.closest('form') !== null
				})
			);
		};
		const onKeydown = (event: Event) => {
			const key = (event as KeyboardEvent).key;
			if (key !== 'Enter' && key !== ' ') return;
			const el = eventElement(event)?.closest(`[${PREVIEW_MARKER_ATTR}="click"]`);
			if (!el) return;
			event.preventDefault();
			go('landing');
		};
		const onSubmit = (event: Event) => event.preventDefault();

		doc.addEventListener('click', onClick, true);
		doc.addEventListener('auxclick', onClick, true);
		doc.addEventListener('submit', onSubmit, true);
		doc.addEventListener('keydown', onKeydown, true);
		const cleanup = () => {
			doc.removeEventListener('click', onClick, true);
			doc.removeEventListener('auxclick', onClick, true);
			doc.removeEventListener('submit', onSubmit, true);
			doc.removeEventListener('keydown', onKeydown, true);
			attached.delete(frame);
			cleanups.delete(cleanup);
		};
		attached.set(frame, cleanup);
		cleanups.add(cleanup);

		const h = doc.documentElement?.scrollHeight ?? 0;
		frame.style.height = `${Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, h))}px`;
	}

	const received = $derived(new Date(preview.receivedAt));
	const hoursBefore = (h: number) => new Date(received.getTime() - h * 3_600_000);

	// Messages fictifs, neutres et inertes.
	const fillers = $derived([
		{
			from: 'Service informatique',
			subject: 'Maintenance planifiée du réseau interne',
			at: hoursBefore(20)
		},
		{
			from: 'Ressources humaines',
			subject: 'Rappel : saisie des heures du mois',
			at: hoursBefore(52)
		},
		{ from: 'Équipe projet', subject: 'Compte rendu de la réunion de lundi', at: hoursBefore(96) }
	]);
</script>

<div class="flex flex-col gap-4">
	<div class="flex flex-wrap items-center justify-between gap-3">
		<div class="max-w-full min-w-0 overflow-x-auto">
			<Tabs tabs={STEPS} bind:value={step} label="Étapes de la maquette" />
		</div>
		<Button variant="secondary" size="sm" onclick={() => (step = 'inbox')}>Recommencer</Button>
	</div>

	{#if step === 'inbox'}
		<div role="tabpanel" id="panel-inbox" aria-labelledby="tab-inbox" class="flex flex-col gap-3">
			<p class="text-ink-dim">
				Boîte de réception fictive de {preview.recipient.firstName}
				{preview.recipient.lastName}. Seul le message du scénario est actif : ouvrez-le pour voir
				l'e-mail.
			</p>
			<Panel flush>
				<ul class="divide-y divide-line">
					<li>
						<button type="button" class="row row-live" onclick={() => (step = 'email')}>
							<span class="min-w-0 flex-1">
								<span class="block truncate font-medium text-ink">{preview.fromName}</span>
								<span class="block truncate text-ink">{preview.subject}</span>
								<span class="block truncate font-mono text-ink-dim">{preview.fromAddress}</span>
							</span>
							<span class="shrink-0 text-ink-dim"><LocalTime value={preview.receivedAt} /></span>
						</button>
					</li>
					{#each fillers as m (m.subject)}
						<li class="row">
							<span class="min-w-0 flex-1">
								<span class="block truncate text-ink-dim">{m.from}</span>
								<span class="block truncate text-ink-dim">{m.subject}</span>
							</span>
							<span class="shrink-0 text-ink-dim"><LocalTime value={m.at} /></span>
						</li>
					{/each}
				</ul>
			</Panel>
		</div>
	{:else if step === 'email'}
		<div role="tabpanel" id="panel-email" aria-labelledby="tab-email" class="flex flex-col gap-3">
			<p class="text-ink-dim">
				E-mail tel que le destinataire le reçoit. Cliquez sur un lien du message pour passer à la
				page de destination.
			</p>
			<Panel>
				<dl class="grid grid-cols-[max-content_minmax(0,1fr)] gap-x-4 gap-y-1.5">
					<dt class="text-ink-dim">De</dt>
					<dd class="break-words text-ink">
						{preview.fromName}
						<span class="font-mono break-all text-ink-dim">&lt;{preview.fromAddress}&gt;</span>
					</dd>
					<dt class="text-ink-dim">À</dt>
					<dd class="break-words text-ink">
						{preview.recipient.firstName}
						{preview.recipient.lastName}
						<span class="font-mono break-all text-ink-dim">&lt;{preview.recipient.email}&gt;</span>
					</dd>
					<dt class="text-ink-dim">Objet</dt>
					<dd class="font-medium break-words text-ink">{preview.subject}</dd>
					<dt class="text-ink-dim">Date</dt>
					<dd class="text-ink"><LocalTime value={preview.receivedAt} /></dd>
				</dl>
			</Panel>
			{@render frame(preview.emailHtml, 'Corps de l’e-mail simulé')}
		</div>
	{:else if step === 'landing'}
		<div
			role="tabpanel"
			id="panel-landing"
			aria-labelledby="tab-landing"
			class="flex flex-col gap-3"
		>
			<div class="flex flex-wrap items-center gap-3">
				<Plate variant="info">Simulation</Plate>
				<p class="text-ink-dim">
					Page de destination simulée : rien n'est envoyé. Le bouton du formulaire mène à la suite.
				</p>
			</div>
			{@render frame(preview.landingHtml, 'Page de destination simulée')}
		</div>
	{:else}
		<div
			role="tabpanel"
			id="panel-awareness"
			aria-labelledby="tab-awareness"
			class="flex flex-col gap-3"
		>
			<div class="flex flex-wrap items-center gap-3">
				<Plate variant="info">Simulation</Plate>
				<p class="text-ink-dim">
					Page de sensibilisation simulée, telle que la verrait la personne qui a cliqué.
				</p>
			</div>
			{@render frame(preview.awarenessHtml, 'Page de sensibilisation simulée')}
		</div>
	{/if}
</div>

{#snippet frame(html: string, title: string)}
	{#if mounted}
		<!-- sandbox exact : jamais de scripts, formulaires, navigation ni fenêtres. -->
		<iframe
			{title}
			srcdoc={html}
			sandbox="allow-same-origin"
			referrerpolicy="no-referrer"
			class="preview-frame"
			style="height: {MIN_HEIGHT}px"
			onload={(e) => attach(e.currentTarget as HTMLIFrameElement)}
		></iframe>
	{:else}
		<Skeleton height="{MIN_HEIGHT}px" />
	{/if}
{/snippet}

<style>
	.preview-frame {
		display: block;
		width: 100%;
		border: 1px solid var(--c-line);
		border-radius: var(--r-card);
		/* Fond clair du contenu simulé, indépendant du thème sombre de l'application. */
		color-scheme: light;
	}

	.row {
		display: flex;
		align-items: center;
		gap: 1rem;
		padding: 0.75rem 1rem;
		min-width: 0;
		width: 100%;
		text-align: left;
	}

	@media (max-width: 767px) {
		.row {
			flex-wrap: wrap;
			align-items: flex-start;
			gap: 0.25rem 1rem;
		}
	}

	.row-live {
		background: transparent;
		border: none;
		cursor: pointer;
		font: inherit;
	}

	.row-live:hover {
		background: var(--c-surface-2);
	}
</style>
