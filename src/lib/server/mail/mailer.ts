// Transport SMTP de redfish, plateforme open-source (MIT) de sensibilisation à la
// sécurité AUTORISÉE : https://github.com/selfhostr/redfish — usage défensif, accord
// écrit requis, aucun identifiant capturé (cf. README « Limits »).
import { rootCertificates } from 'node:tls';
import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { getSmtpPassword } from '$lib/server/sending-profiles';
import { MAIL_MODULE_HOST, readModuleCa } from './module';

/** Champs d'un profil d'envoi nécessaires à l'ouverture du transport SMTP. */
export type TransportProfile = {
	id: string;
	host: string;
	port: number;
	username: string;
};

/**
 * Construit un transport Nodemailer depuis le profil + le mot de passe déchiffré
 * ({@link getSmtpPassword}). Le mot de passe n'est JAMAIS journalisé : il reste
 * confiné aux options du transport et n'est renvoyé par aucune fonction.
 */
export async function buildTransport(profile: TransportProfile): Promise<Transporter> {
	const pass = await getSmtpPassword(profile.id);
	// CA privée du module d'envoi intégré, uniquement pour l'hôte du module : AJOUTÉE aux racines par défaut (jamais à leur
	// place), relue à chaque transport pour suivre une rotation. La vérification des
	// certificats reste active pour tous les profils.
	const moduleCa = profile.host === MAIL_MODULE_HOST ? readModuleCa() : null;
	return nodemailer.createTransport({
		host: profile.host,
		port: profile.port,
		// SMTPS implicite sur 465 ; STARTTLS (mise à niveau) sur les autres ports.
		secure: profile.port === 465,
		// Hors 465, STARTTLS est OBLIGATOIRE : on refuse d'envoyer en clair si le
		// serveur n'annonce pas STARTTLS (p. ex. sur 587), au lieu de dégrader.
		requireTLS: profile.port !== 465,
		auth: { user: profile.username, pass },
		...(moduleCa ? { tls: { ca: [...rootCertificates, moduleCa] } } : {})
	});
}
