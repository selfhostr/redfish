/** Les trois gabarits d'un paquet de scénario (noms de fichiers relatifs au paquet). */
export type ManifestTemplates = {
	email: string;
	landing: string;
	awareness: string;
};

/**
 * Manifeste d'un paquet de scénario, tel que décrit par son `manifest.yaml`.
 * `key`, `subject` et `templates` sont obligatoires ; voir {@link parseManifest}.
 */
export type Manifest = {
	key: string;
	title: string;
	category: string;
	locale: string;
	difficulty: string;
	tags: string[];
	subject: string;
	fromName?: string;
	templates: ManifestTemplates;
};
