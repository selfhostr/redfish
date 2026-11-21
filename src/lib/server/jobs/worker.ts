import { runDueJobs } from './queue';

let timer: ReturnType<typeof setInterval> | null = null;
let busy = false;
let inflight: Promise<void> | null = null;

/** Démarre la boucle : un tick toutes les `intervalMs` (sans chevauchement). */
export function startWorker(intervalMs = 5000) {
	if (timer) return;
	timer = setInterval(async () => {
		if (busy) return;
		busy = true;
		inflight = (async () => {
			try {
				await runDueJobs();
			} catch (err) {
				console.error('worker tick failed:', err);
			} finally {
				busy = false;
				inflight = null;
			}
		})();
		await inflight;
	}, intervalMs);
}

/** Arrête la boucle et attend la fin du tick en cours (arrêt propre). */
export async function stopWorker() {
	if (timer) clearInterval(timer);
	timer = null;
	if (inflight) await inflight;
}
