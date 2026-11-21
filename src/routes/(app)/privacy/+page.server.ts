import { fail } from '@sveltejs/kit';
import { audit } from '$lib/server/audit';
import { erasePerson, findPerson, personRef } from '$lib/server/person-data';
import { isValidEmail, normalizeEmail } from '$lib/server/targets';
import { privacyContext } from './context';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, cookies, url }) => {
	const { tenantId } = await privacyContext(locals, cookies);
	const email = normalizeEmail(url.searchParams.get('email') ?? '');
	if (!email) return { email: '', matches: null, error: null };
	if (!isValidEmail(email)) return { email, matches: null, error: 'E-mail invalide' };
	return { email, matches: await findPerson(tenantId, email), error: null };
};

export const actions: Actions = {
	erase: async ({ request, locals, cookies }) => {
		const { user, tenantId } = await privacyContext(locals, cookies);
		const email = normalizeEmail(String((await request.formData()).get('email') ?? ''));
		if (!isValidEmail(email)) return fail(400, { error: 'E-mail invalide' });
		const result = await erasePerson(tenantId, email);
		audit(user, 'person.erase', {
			tenantId,
			targetType: 'person',
			targetId: personRef(tenantId, email),
			details: result
		});
		return { erased: result };
	}
};
