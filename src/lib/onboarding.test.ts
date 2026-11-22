import { expect, test } from 'vitest';
import { onboardingSteps, showOnboarding } from './onboarding';

test("client qui n'a pas commencé : premiers pas affichés", () => {
	expect(showOnboarding({ listCount: 0, profileCount: 0, campaignCount: 0 })).toBe(true);
	expect(showOnboarding({ listCount: 1, profileCount: 1, campaignCount: 0 })).toBe(true);
});

test('client actif (au moins une campagne) : premiers pas masqués, même incomplets', () => {
	expect(showOnboarding({ listCount: 0, profileCount: 0, campaignCount: 2 })).toBe(false);
	expect(showOnboarding({ listCount: 1, profileCount: 1, campaignCount: 1 })).toBe(false);
});

test('les étapes suivent les compteurs', () => {
	const steps = onboardingSteps({ listCount: 1, profileCount: 0, campaignCount: 0 });
	expect(steps.map((s) => s.done)).toEqual([true, false, false]);
});
