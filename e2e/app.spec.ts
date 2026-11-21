import { expect, test, type Page } from '@playwright/test';
import Database from 'better-sqlite3';

// Credentials created by scripts/seed-demo.ts (demo data, throwaway database).
const EMAIL = 'op@alpina.ch';
const PASSWORD = 'demo-operator-1234';

async function login(page: Page) {
	await page.goto('/login');
	await page.getByLabel('E-mail').fill(EMAIL);
	await page.getByLabel('Mot de passe').fill(PASSWORD);
	await page.getByRole('button', { name: 'Se connecter' }).click();
	await expect(page).not.toHaveURL(/\/login/);
}

test('login is rejected with a wrong password', async ({ page }) => {
	await page.goto('/login');
	await page.getByLabel('E-mail').fill(EMAIL);
	await page.getByLabel('Mot de passe').fill('mauvais-mot-de-passe');
	await page.getByRole('button', { name: 'Se connecter' }).click();
	await expect(page.getByText('Connexion impossible')).toBeVisible();
});

test('login then client creation', async ({ page }) => {
	await login(page);
	await page.goto('/tenants');
	await expect(page.getByRole('heading', { name: 'Clients' })).toBeVisible();
	await page.getByRole('button', { name: 'Nouveau client' }).click();
	await page.getByLabel('Nom', { exact: true }).fill('Client E2E SA');
	await page.getByRole('button', { name: 'Créer le client' }).click();
	await expect(page).toHaveURL(/\/tenants\/[^/]+$/);
	await expect(page.getByRole('heading', { name: 'Client E2E SA' })).toBeVisible();
});

test('campaign list and report for the demo data', async ({ page }) => {
	await login(page);
	await page.goto('/campaigns');
	await expect(page.getByRole('heading', { name: 'Campagnes' })).toBeVisible();
	// The active organization may be a client created by another test: pick the demo one.
	await page.getByLabel('Organisation').selectOption({ label: 'Fiduciaire Alpina SA' });
	const campaign = page.getByRole('link', { name: /Sensibilisation Q4/ }).first();
	await expect(campaign).toBeVisible();
	await campaign.click();
	await page.getByRole('link', { name: 'Rapport', exact: true }).click();
	await expect(page.getByRole('heading', { name: /Rapport de campagne/ })).toBeVisible();
	await expect(page.getByRole('row', { name: /^Destinataires 12$/ })).toBeVisible();
});

test('a tracking link click is recorded then redirected', async ({ request }) => {
	const db = new Database(process.env.E2E_DB!, { readonly: true });
	const row = db
		.prepare(
			`select token from campaign_recipients r
			 where not exists (select 1 from events e where e.campaign_recipient_id = r.id and e.type = 'clicked')
			 limit 1`
		)
		.get() as { token: string } | undefined;
	db.close();
	expect(row).toBeTruthy();
	const res = await request.get(`/t/c/${row!.token}`, { maxRedirects: 0 });
	expect(res.status()).toBe(302);
	expect(res.headers().location).toBe(`/t/p/${row!.token}`);
});
