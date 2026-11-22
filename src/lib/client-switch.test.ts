import { expect, test } from 'vitest';
import { switchTarget } from './client-switch';

test('une fiche du client ramène à sa rubrique', () => {
	expect(switchTarget('/campaigns/abc/report')).toBe('/campaigns');
	expect(switchTarget('/lists/abc')).toBe('/lists');
	expect(switchTarget('/sending-profiles')).toBe('/sending-profiles');
	expect(switchTarget('/privacy')).toBe('/privacy');
});

test("les paramètres de l'ancien client mènent au tableau de bord", () => {
	expect(switchTarget('/tenants/abc')).toBe('/dashboard');
	expect(switchTarget('/tenants')).toBe('/tenants');
});

test('les pages globales sont conservées', () => {
	expect(switchTarget('/scenarios/phish-key')).toBe('/scenarios/phish-key');
	expect(switchTarget('/account')).toBe('/account');
	expect(switchTarget('/dashboard')).toBe('/dashboard');
});
