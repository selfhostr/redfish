import { loadScenarios } from './scenarios/loader';

/**
 * Au démarrage, enregistre (upsert) les éventuels paquets de scénario présents
 * dans le dossier `scenarios/`. Le dépôt ne livre aucun scénario : ce dossier est
 * normalement absent ou vide (0 chargé), ce qui n'est pas une erreur. Le chargement
 * n'écrase ni ne supprime les scénarios créés ou importés (source != builtin).
 * Idempotent ; une erreur est journalisée mais ne bloque jamais le démarrage.
 */
export const scenariosReady: Promise<void> = loadScenarios()
	.then((n) => console.log(`[startup] ${n} scénario(s) chargé(s)`))
	.catch((e) => console.error('[startup] chargement des scénarios impossible :', e));
