const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Vrai si le nom saisi ressemble à une adresse e-mail (erreur de saisie fréquente). */
export function looksLikeEmail(name: string): boolean {
	return EMAIL_RE.test(name.trim());
}

export const EMAIL_NAME_WARNING =
	"Ce nom ressemble à une adresse e-mail. Le nom d'une liste désigne un groupe (ex. « Comptabilité ») ; les adresses des destinataires s'ajoutent ensuite dans la liste.";
