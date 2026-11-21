// File de toasts minimale.
// SECURITE : cet état est au niveau module, donc PARTAGÉ entre toutes les
// requêtes SSR (utilisateurs et tenants confondus). Ne l'appeler QUE côté
// client (handlers d'événements, $effect, onMount), jamais pendant le rendu
// serveur ni dans un load. `toast()` ignore l'appel côté serveur par garde.
import { browser } from '$app/environment';

export type ToastKind = 'signal' | 'advisory' | 'warning' | 'info';
export type ToastItem = { id: number; kind: ToastKind; message: string };

const state = $state<{ items: ToastItem[] }>({ items: [] });

/** Lecture seule (copie) des toasts courants. */
export function getToasts(): readonly ToastItem[] {
	return state.items;
}

let nextId = 1;

export function dismissToast(id: number): void {
	if (!browser) return;
	state.items = state.items.filter((t) => t.id !== id);
}

export function toast(message: string, kind: ToastKind = 'signal', durationMs = 4000): void {
	if (!browser) return;
	const id = nextId++;
	state.items = [...state.items, { id, kind, message }];
	if (durationMs > 0) setTimeout(() => dismissToast(id), durationMs);
}
