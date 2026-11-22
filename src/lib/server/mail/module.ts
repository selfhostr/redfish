import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

/** Nom du service Docker du module d'envoi intégré (hôte SMTP des profils). */
export const MAIL_MODULE_HOST = 'mail';

export type MailModuleConfig = {
	domain: string;
	hostname: string;
	selector: string;
	smtpUser: string;
	smtpPassword: string | null;
};

/** Configuration du module (variables MAIL_*), ou null si MAIL_DOMAIN est vide. */
export function mailModuleConfig(env: NodeJS.ProcessEnv = process.env): MailModuleConfig | null {
	const domain = (env.MAIL_DOMAIN ?? '').trim().toLowerCase();
	if (!domain) return null;
	return {
		domain,
		hostname: env.MAIL_HOSTNAME?.trim() || `mail.${domain}`,
		selector: env.MAIL_DKIM_SELECTOR?.trim() || 'redfish',
		smtpUser: env.MAIL_SMTP_USER?.trim() || 'redfish',
		smtpPassword: env.MAIL_SMTP_PASSWORD || null
	};
}

/** Dossier des artefacts publics du module : à côté de la base SQLite. */
export function mailModulePublicDir(): string {
	const url = (process.env.DATABASE_URL ?? 'file:./data/redfish.db').replace(/^file:/, '');
	return join(dirname(url), 'mail', 'public');
}

function readPublic(name: string): string | null {
	try {
		return readFileSync(join(mailModulePublicDir(), name), 'utf8');
	} catch {
		return null;
	}
}

/** CA privée du module (PEM), relue à chaque appel ; null si absente ou illisible. */
export function readModuleCa(): string | null {
	const pem = readPublic('ca.crt');
	return pem && pem.includes('BEGIN CERTIFICATE') ? pem : null;
}

/** dkim.txt : ligne 1 = sélecteur, ligne 2 = valeur TXT `v=DKIM1; k=rsa; p=…`. */
export function readModuleDkim(): { selector: string; value: string } | null {
	const raw = readPublic('dkim.txt');
	if (!raw) return null;
	const [selector, value] = raw.split('\n').map((l) => l.trim());
	if (!selector || !value || !value.startsWith('v=DKIM1;')) return null;
	return { selector, value };
}
