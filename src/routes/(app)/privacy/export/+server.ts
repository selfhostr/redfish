import { error } from '@sveltejs/kit';
import { audit } from '$lib/server/audit';
import { exportPerson, personRef } from '$lib/server/person-data';
import { isValidEmail, normalizeEmail } from '$lib/server/targets';
import { privacyContext } from '../context';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, locals, cookies }) => {
	const { user, tenantId } = await privacyContext(locals, cookies);
	const email = normalizeEmail(String((await request.formData()).get('email') ?? ''));
	if (!isValidEmail(email)) throw error(400, 'E-mail invalide');
	const data = await exportPerson(tenantId, email);
	const ref = personRef(tenantId, email);
	audit(user, 'person.export', {
		tenantId,
		targetType: 'person',
		targetId: ref,
		details: { targets: data.targets.length }
	});
	return new Response(JSON.stringify(data, null, 2), {
		headers: {
			'content-type': 'application/json; charset=utf-8',
			'content-disposition': `attachment; filename="donnees-${ref}.json"`,
			'cache-control': 'no-store'
		}
	});
};
