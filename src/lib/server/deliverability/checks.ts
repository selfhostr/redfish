import { MAIL_MODULE_HOST } from '$lib/server/mail/module';

/**
 * Vérifications de délivrabilité d'un domaine d'envoi. Fonctions pures : le
 * résolveur DNS et la connexion TCP sont injectés (testés sans réseau).
 * Aucune ne lève : une erreur DNS devient un résultat `unknown` ou `fail`.
 */

export type CheckId = 'spf' | 'dkim' | 'dmarc' | 'ptr' | 'port25' | 'dnsbl' | 'profileDomain';
export type CheckStatus = 'ok' | 'warn' | 'fail' | 'unknown';
export type DnsRecord = { name: string; type: 'TXT' | 'A' | 'PTR'; value: string };
export type CheckResult = {
	id: CheckId;
	status: CheckStatus;
	message: string;
	fix?: string;
	record?: DnsRecord;
};
export type Resolver = {
	resolveTxt(n: string): Promise<string[][]>;
	resolve4(n: string): Promise<string[]>;
	reverse(ip: string): Promise<string[]>;
};

const NOT_FOUND = new Set(['ENOTFOUND', 'ENODATA']);
const code = (e: unknown) => (e as { code?: string })?.code ?? '';
const unknownDns = (id: CheckId, e: unknown): CheckResult => ({
	id,
	status: 'unknown',
	message: `Résolution DNS impossible (${code(e) || 'erreur'}) : non vérifiable pour le moment`,
	fix: 'Relancez les vérifications dans quelques minutes.'
});

/** TXT d'un nom, chaque enregistrement concaténé ; null si le nom n'existe pas. */
async function txtRecords(r: Resolver, name: string): Promise<string[] | null> {
	try {
		return (await r.resolveTxt(name)).map((parts) => parts.join(''));
	} catch (e) {
		if (NOT_FOUND.has(code(e))) return null;
		throw e;
	}
}

const TWO = "Deux enregistrements existent : supprimez l'un des deux (un seul est autorisé)";

export async function checkSpf(
	domain: string,
	r: Resolver,
	expectIp?: string
): Promise<CheckResult> {
	let all: string[] | null;
	try {
		all = await txtRecords(r, domain);
	} catch (e) {
		return unknownDns('spf', e);
	}
	const spf = (all ?? []).filter((t) => /^v=spf1(\s|$)/i.test(t));
	const record: DnsRecord = {
		name: domain,
		type: 'TXT',
		value: expectIp ? `v=spf1 ip4:${expectIp} -all` : 'v=spf1 include:<votre-fournisseur> -all'
	};
	if (spf.length === 0)
		return {
			id: 'spf',
			status: 'fail',
			message: `Aucun enregistrement SPF pour ${domain}`,
			fix: 'Publiez cet enregistrement TXT.',
			record
		};
	if (spf.length > 1)
		return {
			id: 'spf',
			status: 'fail',
			message: `${spf.length} enregistrements SPF sur ${domain} : SPF est invalide (permerror) : supprimez l'un des deux`,
			fix: TWO,
			record
		};
	if (expectIp && !spf[0].includes(`ip4:${expectIp}`))
		return {
			id: 'spf',
			status: 'fail',
			message: `Le SPF n'autorise pas l'IP du serveur d'envoi (${expectIp})`,
			fix: "Ajoutez l'IP à l'enregistrement SPF existant, ou remplacez-le par celui-ci.",
			record
		};
	return { id: 'spf', status: 'ok', message: 'Un seul enregistrement SPF, valide' };
}

const normDkim = (v: string) => v.replace(/\s+/g, '');

export async function checkDkim(
	domain: string,
	selector: string | null,
	r: Resolver,
	expected?: string
): Promise<CheckResult> {
	if (!selector)
		return {
			id: 'dkim',
			status: 'unknown',
			message: 'Sélecteur DKIM inconnu : non vérifiable',
			fix: 'Saisissez le sélecteur fourni par votre prestataire d’envoi.'
		};
	const name = `${selector}._domainkey.${domain}`;
	let recs: string[] | null;
	try {
		recs = await txtRecords(r, name);
	} catch (e) {
		return unknownDns('dkim', e);
	}
	const record: DnsRecord | undefined = expected
		? { name, type: 'TXT', value: expected }
		: undefined;
	if (!recs || recs.length === 0)
		return {
			id: 'dkim',
			status: 'fail',
			message: `Aucune clé DKIM publiée à ${name}`,
			fix: expected
				? 'Publiez cet enregistrement TXT.'
				: 'Publiez la clé fournie par votre prestataire.',
			record
		};
	if (expected && !recs.some((t) => normDkim(t) === normDkim(expected)))
		return {
			id: 'dkim',
			status: 'fail',
			message: 'La clé DKIM publiée diffère de celle du serveur d’envoi',
			fix: 'Remplacez la valeur TXT par celle-ci.',
			record
		};
	return { id: 'dkim', status: 'ok', message: `Clé DKIM présente à ${name}` };
}

export async function checkDmarc(domain: string, r: Resolver): Promise<CheckResult> {
	const name = `_dmarc.${domain}`;
	let all: string[] | null;
	try {
		all = await txtRecords(r, name);
	} catch (e) {
		return unknownDns('dmarc', e);
	}
	const dmarc = (all ?? []).filter((t) => /^v=DMARC1\b/i.test(t.trim()));
	const record: DnsRecord = {
		name,
		type: 'TXT',
		value: `v=DMARC1; p=none; rua=mailto:dmarc@${domain}`
	};
	if (dmarc.length === 0)
		return {
			id: 'dmarc',
			status: 'fail',
			message: `Aucun enregistrement DMARC pour ${domain}`,
			fix: 'Publiez cet enregistrement TXT (politique p=none pour commencer).',
			record
		};
	if (dmarc.length > 1)
		return {
			id: 'dmarc',
			status: 'fail',
			message: `${dmarc.length} enregistrements DMARC à ${name} : DMARC est ignoré : supprimez l'un des deux`,
			fix: TWO,
			record
		};
	const policy = /(?:^|;)\s*p\s*=\s*(\w+)/i.exec(dmarc[0])?.[1]?.toLowerCase() ?? '';
	if (policy === 'quarantine' || policy === 'reject')
		return { id: 'dmarc', status: 'ok', message: `DMARC présent, politique p=${policy}` };
	return {
		id: 'dmarc',
		status: 'warn',
		message: `DMARC présent, politique p=${policy || 'absente'} : passez à quarantine quand tout est validé`,
		fix: 'Passez à quarantine quand tout est validé.'
	};
}

/** IPv4 → nom inversé (1.2.3.4 → 4.3.2.1). */
const reverseIp = (ip: string) => ip.split('.').reverse().join('.');

export async function checkPtr(hostname: string, r: Resolver): Promise<CheckResult> {
	const host = hostname.toLowerCase();
	let ips: string[];
	try {
		ips = await r.resolve4(host);
	} catch (e) {
		if (!NOT_FOUND.has(code(e))) return unknownDns('ptr', e);
		return {
			id: 'ptr',
			status: 'fail',
			message: `${host} n'a pas d'enregistrement A`,
			fix: "Créez un enregistrement A vers l'IP publique du serveur.",
			record: { name: host, type: 'A', value: '<IP publique du serveur>' }
		};
	}
	const ip = ips[0];
	const ptrRecord: DnsRecord = { name: `${reverseIp(ip)}.in-addr.arpa`, type: 'PTR', value: host };
	let names: string[];
	try {
		names = (await r.reverse(ip)).map((n) => n.toLowerCase().replace(/\.$/, ''));
	} catch (e) {
		if (!NOT_FOUND.has(code(e))) return unknownDns('ptr', e);
		names = [];
	}
	if (!names.includes(host))
		return {
			id: 'ptr',
			status: 'fail',
			message: `Le PTR de ${ip} est ${names.join(', ') || 'absent'}, attendu ${host}`,
			fix: "Demandez à l'hébergeur de définir le DNS inverse (PTR) de cette IP.",
			record: ptrRecord
		};
	try {
		const back = await r.resolve4(host);
		if (back.includes(ip))
			return { id: 'ptr', status: 'ok', message: `PTR cohérent : ${ip} ↔ ${host}` };
	} catch (e) {
		return unknownDns('ptr', e);
	}
	return {
		id: 'ptr',
		status: 'fail',
		message: `${host} ne résout pas vers ${ip}`,
		fix: "Corrigez l'enregistrement A.",
		record: { name: host, type: 'A', value: ip }
	};
}

/** Listes interrogées ; 127.255.255.x = refus de service (résolveur public), pas un verdict. */
const BLOCKLISTS = ['zen.spamhaus.org', 'bl.spamcop.net'];

export async function checkDnsbl(ip: string, r: Resolver): Promise<CheckResult> {
	const listed: string[] = [];
	const inconclusive: string[] = [];
	for (const bl of BLOCKLISTS) {
		try {
			const answers = await r.resolve4(`${reverseIp(ip)}.${bl}`);
			if (answers.length > 0 && answers.every((a) => a.startsWith('127.255.255.')))
				inconclusive.push(bl);
			else listed.push(bl);
		} catch (e) {
			if (!NOT_FOUND.has(code(e))) inconclusive.push(bl);
		}
	}
	if (listed.length)
		return {
			id: 'dnsbl',
			status: 'fail',
			message: `${ip} figure sur : ${listed.join(', ')}`,
			fix: 'Demandez le retrait auprès de la liste concernée après avoir corrigé la cause.'
		};
	if (inconclusive.length)
		return {
			id: 'dnsbl',
			status: 'unknown',
			message: `Réponse non vérifiable de ${inconclusive.join(', ')} (résolveur public refusé ou délai dépassé)`,
			fix: 'Interrogez la liste depuis son site web.'
		};
	return {
		id: 'dnsbl',
		status: 'ok',
		message: `${ip} ne figure sur aucune liste (${BLOCKLISTS.join(', ')})`
	};
}

export const PORT25_HOST = 'gmail-smtp-in.l.google.com';

export async function checkPort25(
	connect: (host: string, port: number, ms: number) => Promise<boolean>
): Promise<CheckResult> {
	let reachable = false;
	try {
		reachable = await connect(PORT25_HOST, 25, 5000);
	} catch {
		reachable = false;
	}
	if (reachable) return { id: 'port25', status: 'ok', message: 'Le port 25 sortant est ouvert' };
	return {
		id: 'port25',
		status: 'fail',
		message: "Le port 25 sortant est bloqué par l'hébergeur",
		fix: "Demandez l'ouverture du port 25 sortant, ou utilisez un profil d'envoi externe."
	};
}

export function checkProfileDomains(
	profiles: { name: string; host: string; fromAddress: string }[],
	moduleDomain: string | null
): CheckResult {
	const wrong = profiles.filter(
		(p) =>
			p.host === MAIL_MODULE_HOST &&
			moduleDomain &&
			p.fromAddress.split('@').pop()?.toLowerCase() !== moduleDomain
	);
	if (wrong.length === 0)
		return {
			id: 'profileDomain',
			status: 'ok',
			message: 'Les profils du module envoient depuis le domaine signé'
		};
	return {
		id: 'profileDomain',
		status: 'fail',
		message: `${wrong.map((p) => p.name).join(', ')} : ce profil passe par le module mais n'envoie pas depuis le domaine signé : DMARC échouera`,
		fix: `Utilisez une adresse expéditeur en @${moduleDomain}.`
	};
}
