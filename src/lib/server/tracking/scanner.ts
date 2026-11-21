/**
 * Catégorie GROSSIÈRE d'un user-agent. Jamais la chaîne UA complète ni d'IP :
 * on ne conserve qu'un libellé minimal (minimisation des données, nLPD).
 */
export type UaCategory = 'email-scanner' | 'bot' | 'mobile' | 'desktop' | 'other' | 'unknown';

/** Verdict de qualification d'un accès : catégorie grossière + automate oui/non. */
export type ScannerVerdict = { uaCategory: UaCategory; isAutomated: boolean };

/**
 * Seuil « ouverture/clic trop rapide pour être humain » (en ms depuis l'envoi).
 * Un passage sous ce délai est quasi certainement un automate (passerelle de
 * sécurité qui déroule les liens à la réception).
 */
export const IMPLAUSIBLY_FAST_MS = 5_000;

/** Familles d'UA de scanners/passerelles d'e-mails connues. */
const SCANNER_PATTERNS: RegExp[] = [
	/safelinks/i, // Microsoft Defender / Safe Links
	/microsoft office/i,
	/bingpreview/i,
	/barracuda/i,
	/proofpoint/i,
	/mimecast/i,
	/forcepoint/i,
	/symantec/i,
	/messagelabs/i, // Symantec.cloud / MessageLabs
	/cloudmark/i,
	/fireeye/i,
	/trend ?micro/i,
	/googleimageproxy/i // proxy d'images Gmail
];

/** Familles d'UA d'automates génériques (robots, outils en ligne de commande). */
const BOT_PATTERNS: RegExp[] = [
	/bot\b/i,
	/crawler/i,
	/spider/i,
	/slurp/i,
	/headless/i,
	/phantomjs/i,
	/python-requests/i,
	/\bcurl\b/i,
	/\bwget\b/i,
	/go-http-client/i,
	/okhttp/i,
	/libwww/i,
	/apache-httpclient/i
];

/**
 * Qualifie un accès à partir de son user-agent et du délai écoulé depuis
 * l'envoi. `isAutomated` est vrai pour une famille de scanner/robot connue OU
 * une ouverture/un clic invraisemblablement rapide (< {@link IMPLAUSIBLY_FAST_MS}).
 * `uaCategory` reste une catégorie grossière : on ne stocke jamais l'UA complet.
 */
export function qualifyScanner(ua: string | null, msSinceSent: number | null): ScannerVerdict {
	const value = (ua ?? '').trim();
	const tooFast = msSinceSent !== null && msSinceSent >= 0 && msSinceSent < IMPLAUSIBLY_FAST_MS;

	if (value === '') {
		return { uaCategory: 'unknown', isAutomated: tooFast };
	}
	if (SCANNER_PATTERNS.some((re) => re.test(value))) {
		return { uaCategory: 'email-scanner', isAutomated: true };
	}
	if (BOT_PATTERNS.some((re) => re.test(value))) {
		return { uaCategory: 'bot', isAutomated: true };
	}

	const category: UaCategory = /mobile|android|iphone|ipad|ipod/i.test(value)
		? 'mobile'
		: /windows|macintosh|mac os|linux|x11|cros/i.test(value)
			? 'desktop'
			: 'other';
	return { uaCategory: category, isAutomated: tooFast };
}
