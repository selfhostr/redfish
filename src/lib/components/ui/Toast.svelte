<script lang="ts">
	import { getToasts, dismissToast, type ToastKind } from './toast.svelte';

	// Conteneur à monter une seule fois (layout). Statut = point + mot + couleur.
	const words: Record<ToastKind, string> = {
		signal: 'Succès',
		advisory: 'Attention',
		warning: 'Erreur',
		info: 'Info'
	};
</script>

<div class="toasts" role="region" aria-label="Notifications">
	{#each getToasts() as t (t.id)}
		<div class="toast {t.kind}" role={t.kind === 'warning' ? 'alert' : 'status'}>
			<span class="dot" aria-hidden="true"></span>
			<span class="word">{words[t.kind]}</span>
			<span class="msg">{t.message}</span>
			<button
				type="button"
				class="close"
				aria-label="Fermer la notification"
				onclick={() => dismissToast(t.id)}
			>
				Fermer
			</button>
		</div>
	{/each}
</div>

<style>
	.toasts {
		position: fixed;
		right: 1rem;
		bottom: 1rem;
		z-index: 50;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		max-width: 24rem;
	}
	@media (max-width: 767px) {
		.toasts {
			left: 0;
			right: 0;
			bottom: 0;
			max-width: none;
			padding: 0 1rem;
			padding-left: max(1rem, env(safe-area-inset-left));
			padding-right: max(1rem, env(safe-area-inset-right));
			padding-bottom: max(1rem, env(safe-area-inset-bottom));
			pointer-events: none;
		}
		.toast {
			pointer-events: auto;
		}
		.close {
			min-height: 40px;
			padding: 0 0.5rem;
		}
	}
	.toast {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 0.75rem;
		background: var(--toast-bg, var(--c-surface-2));
		border: 1px solid var(--c-line-strong);
		border-radius: var(--r-btn);
		font-size: 0.8125rem;
	}
	.dot {
		width: 0.5rem;
		height: 0.5rem;
		border-radius: 50%;
		background: var(--toast-color);
		flex: none;
	}
	.word {
		color: var(--toast-color);
		font-weight: 500;
	}
	.msg {
		color: var(--c-ink);
		flex: 1;
		min-width: 0;
		overflow-wrap: anywhere;
	}
	.close {
		background: transparent;
		border: 0;
		color: var(--c-ink-dim);
		font: inherit;
		font-size: 0.75rem;
		cursor: pointer;
	}
	.close:hover {
		color: var(--c-ink);
	}
	.signal {
		--toast-color: var(--c-signal);
		--toast-bg: var(--c-signal-bg);
	}
	.advisory {
		--toast-color: var(--c-advisory);
		--toast-bg: var(--c-advisory-bg);
	}
	.warning {
		--toast-color: var(--c-warning);
		--toast-bg: var(--c-warning-bg);
	}
	.info {
		--toast-color: var(--c-info);
		--toast-bg: var(--c-info-bg);
	}
</style>
