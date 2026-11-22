import { expect, test } from 'vitest';
import {
	checkDkim,
	checkDmarc,
	checkDnsbl,
	checkPort25,
	checkProfileDomains,
	checkPtr,
	checkSpf,
	type Resolver
} from './checks';

const dnsErr = (code: string) => Object.assign(new Error(code), { code });

type Tables = {
	txt?: Record<string, string[][]>;
	a?: Record<string, string[]>;
	ptr?: Record<string, string[]>;
	fail?: string;
};

/** Résolveur factice : tables nom → réponses ; tout le reste = ENOTFOUND. */
function fake(o: Tables = {}): Resolver {
	const look = <T>(t: Record<string, T> | undefined, k: string): Promise<T> => {
		if (o.fail) return Promise.reject(dnsErr(o.fail));
		const v = t?.[k];
		return v ? Promise.resolve(v) : Promise.reject(dnsErr('ENOTFOUND'));
	};
	return {
		resolveTxt: (n) => look(o.txt, n),
		resolve4: (n) => look(o.a, n),
		reverse: (ip) => look(o.ptr, ip)
	};
}

test('SPF : un seul enregistrement qui autorise l’IP du module → ok', async () => {
	const r = fake({ txt: { 'd.test': [['v=spf1 ip4:1.2.3.4 -all']] } });
	expect((await checkSpf('d.test', r, '1.2.3.4')).status).toBe('ok');
});

test('SPF : IP du module absente → fail avec l’enregistrement à publier', async () => {
	const r = fake({ txt: { 'd.test': [['v=spf1 include:_spf.example.net -all']] } });
	const c = await checkSpf('d.test', r, '1.2.3.4');
	expect(c.status).toBe('fail');
	expect(c.record).toEqual({ name: 'd.test', type: 'TXT', value: 'v=spf1 ip4:1.2.3.4 -all' });
});

test('SPF : deux enregistrements → fail, jamais ok', async () => {
	const r = fake({
		txt: { 'd.test': [['v=spf1 ip4:1.2.3.4 -all'], ['v=spf1 include:x.test -all']] }
	});
	const c = await checkSpf('d.test', r, '1.2.3.4');
	expect(c.status).toBe('fail');
	expect(c.message).toMatch(/supprimez l'un des deux/);
});

test('SPF : absent → fail ; DNS en échec → unknown', async () => {
	expect((await checkSpf('d.test', fake())).status).toBe('fail');
	const c = await checkSpf('d.test', fake({ fail: 'ETIMEOUT' }));
	expect(c.status).toBe('unknown');
});

test('SPF : sans IP attendue, un enregistrement valide → ok', async () => {
	const r = fake({ txt: { 'd.test': [['v=spf1 include:x.test', ' -all']] } });
	expect((await checkSpf('d.test', r)).status).toBe('ok');
});

const DKIM = 'v=DKIM1; k=rsa; p=ABC';
test('DKIM : identique à dkim.txt → ok, différent → fail, sélecteur inconnu → unknown', async () => {
	const name = 'redfish._domainkey.d.test';
	const same = fake({ txt: { [name]: [['v=DKIM1; k=rsa; ', 'p=ABC']] } });
	expect((await checkDkim('d.test', 'redfish', same, DKIM)).status).toBe('ok');
	const other = fake({ txt: { [name]: [['v=DKIM1; k=rsa; p=XYZ']] } });
	const bad = await checkDkim('d.test', 'redfish', other, DKIM);
	expect(bad.status).toBe('fail');
	expect(bad.record).toEqual({ name, type: 'TXT', value: DKIM });
	expect((await checkDkim('d.test', null, same)).status).toBe('unknown');
	expect((await checkDkim('d.test', 'redfish', fake(), DKIM)).status).toBe('fail');
});

test('DMARC : p=none → warn, quarantine/reject → ok', async () => {
	const t = (v: string) => fake({ txt: { '_dmarc.d.test': [[v]] } });
	const none = await checkDmarc('d.test', t('v=DMARC1; p=none'));
	expect(none.status).toBe('warn');
	expect(none.message).toMatch(/passez à quarantine quand tout est validé/);
	expect((await checkDmarc('d.test', t('v=DMARC1; p=quarantine'))).status).toBe('ok');
	expect((await checkDmarc('d.test', t('v=DMARC1; p=reject; rua=mailto:a@d.test'))).status).toBe(
		'ok'
	);
});

test('DMARC : deux enregistrements → fail ; absent → fail ; timeout → unknown', async () => {
	const two = fake({ txt: { '_dmarc.d.test': [['v=DMARC1; p=none'], ['v=DMARC1; p=reject']] } });
	const c = await checkDmarc('d.test', two);
	expect(c.status).toBe('fail');
	expect(c.message).toMatch(/supprimez l'un des deux/);
	const missing = await checkDmarc('d.test', fake());
	expect(missing.status).toBe('fail');
	expect(missing.record?.name).toBe('_dmarc.d.test');
	expect((await checkDmarc('d.test', fake({ fail: 'ETIMEOUT' }))).status).toBe('unknown');
});

test('PTR : FCrDNS cohérent → ok ; PTR différent → fail avec la valeur attendue', async () => {
	const good = fake({
		a: { 'mail.d.test': ['1.2.3.4'] },
		ptr: { '1.2.3.4': ['mail.d.test'] }
	});
	expect((await checkPtr('mail.d.test', good)).status).toBe('ok');
	const bad = fake({
		a: { 'mail.d.test': ['1.2.3.4'] },
		ptr: { '1.2.3.4': ['host.isp.example'] }
	});
	const c = await checkPtr('mail.d.test', bad);
	expect(c.status).toBe('fail');
	expect(c.record).toEqual({ name: '4.3.2.1.in-addr.arpa', type: 'PTR', value: 'mail.d.test' });
	const noA = await checkPtr('mail.d.test', fake());
	expect(noA.status).toBe('fail');
	expect(noA.record).toMatchObject({ type: 'A', name: 'mail.d.test' });
	expect((await checkPtr('mail.d.test', fake({ fail: 'ETIMEOUT' }))).status).toBe('unknown');
});

test('PTR : le nom du PTR ne résout pas vers l’IP → fail', async () => {
	const r = fake({
		a: { 'mail.d.test': ['1.2.3.4'], 'other.test': ['9.9.9.9'] },
		ptr: { '1.2.3.4': ['other.test'] }
	});
	expect((await checkPtr('mail.d.test', r)).status).toBe('fail');
});

/** Résolveur DNSBL : `<ip inversée>.<liste>` → réponse. */
function bl(answers: Record<string, string[]>): Resolver {
	return {
		resolveTxt: () => Promise.reject(dnsErr('ENOTFOUND')),
		reverse: () => Promise.reject(dnsErr('ENOTFOUND')),
		resolve4: (n) => {
			const v = answers[n];
			return v ? Promise.resolve(v) : Promise.reject(dnsErr('ENOTFOUND'));
		}
	};
}

test('DNSBL : NXDOMAIN partout → ok ; 127.0.0.2 → fail', async () => {
	expect((await checkDnsbl('1.2.3.4', bl({}))).status).toBe('ok');
	const c = await checkDnsbl('1.2.3.4', bl({ '4.3.2.1.zen.spamhaus.org': ['127.0.0.2'] }));
	expect(c.status).toBe('fail');
	expect(c.message).toContain('zen.spamhaus.org');
});

test('DNSBL : 127.255.255.x (résolveur public) → unknown, jamais « listé »', async () => {
	const c = await checkDnsbl('1.2.3.4', bl({ '4.3.2.1.zen.spamhaus.org': ['127.255.255.254'] }));
	expect(c.status).toBe('unknown');
	expect(c.message).toMatch(/non vérifiable/);
	expect(c.message).not.toMatch(/listé/);
});

test('DNSBL : une liste fiable listée l’emporte sur une inconclusive ; timeout → unknown', async () => {
	const mixed = bl({
		'4.3.2.1.zen.spamhaus.org': ['127.255.255.254'],
		'4.3.2.1.bl.spamcop.net': ['127.0.0.2']
	});
	expect((await checkDnsbl('1.2.3.4', mixed)).status).toBe('fail');
	const slow: Resolver = { ...bl({}), resolve4: () => Promise.reject(dnsErr('ETIMEOUT')) };
	expect((await checkDnsbl('1.2.3.4', slow)).status).toBe('unknown');
});

test('port 25 : joignable → ok ; bloqué → fail ; erreur → fail', async () => {
	const seen: unknown[][] = [];
	const ok = await checkPort25(async (...a) => (seen.push(a), true));
	expect(ok.status).toBe('ok');
	expect(seen[0]).toEqual(['gmail-smtp-in.l.google.com', 25, 5000]);
	const blocked = await checkPort25(async () => false);
	expect(blocked.status).toBe('fail');
	expect(blocked.message).toBe("Le port 25 sortant est bloqué par l'hébergeur");
	expect((await checkPort25(() => Promise.reject(new Error('x')))).status).toBe('fail');
});

test('profils : hôte mail avec un autre domaine → fail ; domaine du module → ok', () => {
	const bad = checkProfileDomains(
		[{ name: 'Intégré', host: 'mail', fromAddress: 'noreply@autre.test' }],
		'd.test'
	);
	expect(bad.status).toBe('fail');
	expect(bad.message).toContain("n'envoie pas depuis le domaine signé");
	const good = checkProfileDomains(
		[
			{ name: 'Intégré', host: 'mail', fromAddress: 'NoReply@D.test' },
			{ name: 'Ext', host: 'smtp.x.test', fromAddress: 'a@autre.test' }
		],
		'd.test'
	);
	expect(good.status).toBe('ok');
	expect(checkProfileDomains([], null).status).toBe('ok');
});
