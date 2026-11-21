/** Process worker : exécute la file de jobs. `npm run worker` (dev, tsx) ; production : `node build/worker.js` (bundle esbuild). */
import { startWorker, stopWorker } from '../src/lib/server/jobs/worker';
// Import pour effet de bord : enregistre le handler `send-email` dans la file
// (la file ne réclame que les types ayant un handler enregistré).
import '../src/lib/server/jobs/handlers/send-email';
import { scheduleRetention } from '../src/lib/server/jobs/handlers/retention';
import { scheduleCompletionCheck } from '../src/lib/server/jobs/handlers/campaign-completion';
import { scheduleLaunchCheck } from '../src/lib/server/jobs/handlers/scheduled-launch';

// Amorce la purge quotidienne de rétention (no-op si déjà planifiée).
await scheduleRetention();
await scheduleLaunchCheck();
await scheduleCompletionCheck();
startWorker(Number(process.env.WORKER_INTERVAL_MS ?? 5000));
console.log('worker started');

// Arrêt propre : termine le tick en cours puis quitte.
let stopping = false;
for (const sig of ['SIGINT', 'SIGTERM']) {
	process.on(sig, async () => {
		if (stopping) return;
		stopping = true;
		console.log(`${sig} received, finishing in-flight tick`);
		await stopWorker();
		process.exit(0);
	});
}
