import { recordEvent } from '$lib/server/tracking/events';
import { isTrackingLimited } from '$lib/server/tracking/guard';
import type { RequestHandler } from './$types';

// GIF transparent 1×1 (43 octets), servi comme pixel d'ouverture.
const PIXEL = Uint8Array.from(
	atob('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'),
	(c) => c.charCodeAt(0)
);

/**
 * Pixel d'ouverture. Enregistre `opened` pour le jeton puis renvoie TOUJOURS le
 * GIF (statut 200) : un jeton inconnu n'enregistre rien mais reçoit quand même
 * l'image, pour ne rien révéler. Ne lit jamais de corps de requête.
 */
export const GET: RequestHandler = async ({ params, request, getClientAddress }) => {
	// Limité : on sert quand même l'image, sans rien enregistrer.
	if (!isTrackingLimited(getClientAddress)) {
		await recordEvent(params.token, 'opened', { ua: request.headers.get('user-agent') });
	}
	return new Response(PIXEL, {
		status: 200,
		headers: {
			'content-type': 'image/gif',
			'content-length': String(PIXEL.byteLength),
			'cache-control': 'no-store, no-cache, must-revalidate, private',
			pragma: 'no-cache',
			expires: '0'
		}
	});
};
