import { createCipheriv, createDecipheriv, createHash, randomBytes, scryptSync } from 'node:crypto';

const IV_LEN = 12;
const TAG_LEN = 16;
const KEY_LEN = 32; // AES-256

/**
 * Préfixe de version des valeurs chiffrées.
 * - `v2:` -> clé dérivée par scrypt (schéma courant).
 * - sans préfixe -> ancien schéma (SHA-256 nu), conservé pour le déchiffrement
 *   des valeurs écrites avant ce durcissement (rétrocompatibilité, cf. ci-dessous).
 *
 * Migration : rétrocompatible sans perte. Les anciennes valeurs (sans préfixe)
 * restent déchiffrables via la dérivation SHA-256 héritée ; toute nouvelle
 * écriture utilise scrypt et porte le préfixe `v2:`. Aucune ressaisie des
 * profils d'envoi n'est nécessaire.
 */
const V2_PREFIX = 'v2:';

/**
 * Sel d'application fixe et documenté pour scrypt. Le secret réel reste
 * `REDFISH_SECRET_KEY` ; ce sel domaine-sépare simplement la dérivation.
 */
const APP_SALT = Buffer.from('redfish:aes-256-gcm:scrypt:v2', 'utf8');

/** Paramètres scrypt (coût CPU/mémoire). N=16384,r=8,p=1 ≈ 16 Mio. */
const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 } as const;

/** Mémoïsation des clés dérivées par scrypt (indexée par la valeur brute). */
const scryptCache = new Map<string, Buffer>();

/** Lit `REDFISH_SECRET_KEY` ; lève si absente ou vide. */
function getRawKey(): string {
	const raw = process.env.REDFISH_SECRET_KEY;
	if (!raw || !raw.trim()) {
		throw new Error('REDFISH_SECRET_KEY est absente ou vide : impossible de chiffrer/déchiffrer');
	}
	return raw;
}

/** Dérive une clé AES-256 (32 octets) à partir de `raw` via scrypt. */
export function deriveKey(raw: string): Buffer {
	let key = scryptCache.get(raw);
	if (!key) {
		key = scryptSync(raw, APP_SALT, KEY_LEN, SCRYPT_PARAMS);
		scryptCache.set(raw, key);
	}
	return key;
}

/** Dérivation héritée (SHA-256 nu) pour déchiffrer les valeurs sans préfixe. */
function deriveLegacyKey(raw: string): Buffer {
	return createHash('sha256').update(raw, 'utf8').digest();
}

/** Chiffre en AES-256-GCM ; renvoie `v2:` + base64(iv | authTag | ciphertext). */
export function encryptSecret(plain: string): string {
	const key = deriveKey(getRawKey());
	const iv = randomBytes(IV_LEN);
	const cipher = createCipheriv('aes-256-gcm', key, iv);
	const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
	return V2_PREFIX + Buffer.concat([iv, cipher.getAuthTag(), ct]).toString('base64');
}

/** Inverse de `encryptSecret` ; lève si les données sont altérées ou la clé différente. */
export function decryptSecret(enc: string): string {
	const raw = getRawKey();
	let key: Buffer;
	let payload: string;
	if (enc.startsWith(V2_PREFIX)) {
		key = deriveKey(raw);
		payload = enc.slice(V2_PREFIX.length);
	} else {
		// Valeur écrite par l'ancien schéma : dérivation SHA-256 héritée.
		key = deriveLegacyKey(raw);
		payload = enc;
	}
	const buf = Buffer.from(payload, 'base64');
	if (buf.length < IV_LEN + TAG_LEN) throw new Error('Secret chiffré invalide');
	const iv = buf.subarray(0, IV_LEN);
	const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
	const ct = buf.subarray(IV_LEN + TAG_LEN);
	const decipher = createDecipheriv('aes-256-gcm', key, iv);
	decipher.setAuthTag(tag);
	return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
}
