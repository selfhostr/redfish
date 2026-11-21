import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { getSmtpPassword } from '$lib/server/sending-profiles';

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
	return nodemailer.createTransport({
		host: profile.host,
		port: profile.port,
		// SMTPS implicite sur 465 ; STARTTLS (mise à niveau) sur les autres ports.
		secure: profile.port === 465,
		// Hors 465, STARTTLS est OBLIGATOIRE : on refuse d'envoyer en clair si le
		// serveur n'annonce pas STARTTLS (p. ex. sur 587), au lieu de dégrader.
		requireTLS: profile.port !== 465,
		auth: { user: profile.username, pass }
	});
}
