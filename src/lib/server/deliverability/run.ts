import { Resolver as DnsResolver } from 'node:dns/promises';
import { connect as netConnect } from 'node:net';
import { mailModuleConfig, readModuleDkim } from '$lib/server/mail/module';
import {
	checkDkim,
	checkDmarc,
	checkDnsbl,
	checkPort25,
	checkPtr,
	checkSpf,
	type CheckResult,
	type Resolver
} from './checks';

export type RunOptions = { selector?: string | null; force?: boolean };
export type RunResult = { checks: CheckResult[]; checkedAt: Date };
export type RunDeps = {
	resolver?: Resolver;
	connect?: (host: string, port: number, ms: number) => Promise<boolean>;
};

const CACHE_MS = 5 * 60_000;
const DNS_TIMEOUT_MS = 4000;
const cache = new Map<string, RunResult>();

/** Borne la durée d'un appel DNS, quoi que fasse le résolveur système. */
function bounded<T>(p: Promise<T>): Promise<T> {
	let timer: NodeJS.Timeout;
	const timeout = new Promise<never>((_, reject) => {
		timer = setTimeout(
			() => reject(Object.assign(new Error('timeout'), { code: 'ETIMEOUT' })),
			DNS_TIMEOUT_MS
		);
	});
	return Promise.race([p, timeout]).finally(() => clearTimeout(timer));
}

export function realResolver(): Resolver {
	const r = new DnsResolver({ timeout: DNS_TIMEOUT_MS, tries: 1 });
	return {
		resolveTxt: (n) => bounded(r.resolveTxt(n)),
		resolve4: (n) => bounded(r.resolve4(n)),
		reverse: (ip) => bounded(r.reverse(ip))
	};
}

/** Connexion TCP ouverte puis fermée aussitôt (ni EHLO ni données). */
export function tcpConnect(host: string, port: number, ms: number): Promise<boolean> {
	return new Promise((resolve) => {
		const socket = netConnect({ host, port, family: 4 });
		const done = (ok: boolean) => {
			socket.destroy();
			resolve(ok);
		};
		socket.setTimeout(ms, () => done(false));
		socket.once('connect', () => done(true));
		socket.once('error', () => done(false));
	});
}

const byProvider = (id: CheckResult['id']): CheckResult => ({
	id,
	status: 'unknown',
	message: 'Pris en charge par votre prestataire d’envoi : non vérifié ici'
});

async function compute(domain: string, selector: string | null, deps: RunDeps) {
	const r = deps.resolver ?? realResolver();
	const connect = deps.connect ?? tcpConnect;
	const mod = mailModuleConfig();
	if (mod && mod.domain === domain) {
		const ips = await r.resolve4(mod.hostname).catch(() => [] as string[]);
		const ip = ips[0];
		const dkim = readModuleDkim();
		return Promise.all([
			checkSpf(domain, r, ip),
			checkDkim(domain, dkim?.selector ?? mod.selector, r, dkim?.value),
			checkDmarc(domain, r),
			checkPtr(mod.hostname, r),
			checkPort25(connect),
			ip
				? checkDnsbl(ip, r)
				: Promise.resolve<CheckResult>({
						id: 'dnsbl',
						status: 'unknown',
						message: `${mod.hostname} ne résout pas vers une IP : non vérifiable`,
						fix: 'Créez d’abord l’enregistrement A du serveur d’envoi.'
					})
		]);
	}
	return Promise.all([
		checkSpf(domain, r),
		checkDkim(domain, selector, r),
		checkDmarc(domain, r),
		byProvider('ptr'),
		byProvider('port25'),
		byProvider('dnsbl')
	]);
}

/** Lance (ou relit du cache, 5 min par domaine et sélecteur) les vérifications. */
export async function runDeliverabilityChecks(
	domain: string,
	opts: RunOptions = {},
	deps: RunDeps = {}
): Promise<RunResult> {
	const selector = opts.selector?.trim() || null;
	const key = `${domain}|${selector ?? ''}`;
	const hit = cache.get(key);
	if (!opts.force && hit && Date.now() - hit.checkedAt.getTime() < CACHE_MS) return hit;
	const res: RunResult = { checks: await compute(domain, selector, deps), checkedAt: new Date() };
	cache.set(key, res);
	return res;
}

export function clearDeliverabilityCache(): void {
	cache.clear();
}
