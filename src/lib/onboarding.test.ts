import { expect, test } from 'vitest';
import { clientSettingsDone, onboardingSteps, showOnboarding } from './onboarding';

const none = { settingsDone: false, listCount: 0, profileCount: 0, campaignCount: 0 };

test("client qui n'a pas commencé : premiers pas affichés", () => {
	expect(showOnboarding(none)).toBe(true);
	expect(showOnboarding({ ...none, settingsDone: true, listCount: 1, profileCount: 1 })).toBe(true);
});

test('client avec une campagne : premiers pas masqués, même incomplets', () => {
	expect(showOnboarding({ ...none, campaignCount: 2 })).toBe(false);
	expect(
		showOnboarding({ settingsDone: true, listCount: 1, profileCount: 1, campaignCount: 1 })
	).toBe(false);
});

test('les étapes suivent les compteurs et gardent leur ordre', () => {
	const steps = onboardingSteps({ ...none, settingsDone: true, listCount: 1 }, 't1');
	expect(steps.map((s) => s.done)).toEqual([true, true, false, false]);
	expect(steps.map((s) => s.href)).toEqual([
		'/tenants/t1',
		'/lists',
		'/sending-profiles',
		'/campaigns/new'
	]);
});

test("paramètres complétés dès qu'un contact est renseigné", () => {
	expect(clientSettingsDone({ contactEmail: 'a@b.ch' })).toBe(true);
	expect(clientSettingsDone({ contactName: 'Alice', contactEmail: '' })).toBe(true);
	expect(clientSettingsDone({ contactName: ' ', contactEmail: null })).toBe(false);
	expect(clientSettingsDone(null)).toBe(false);
});
