import { loadScenarios } from './scenarios/loader';

/**
 * Au démarrage, enregistre (upsert) les scénarios présents sur disque dans la
 * base afin que le menu de création de campagne les propose. Idempotent ;
 * une erreur est journalisée mais ne bloque jamais le démarrage.
 */
export const scenariosReady: Promise<void> = loadScenarios()
	.then((n) => console.log(`[startup] ${n} scénario(s) chargé(s)`))
	.catch((e) => console.error('[startup] chargement des scénarios impossible :', e));
