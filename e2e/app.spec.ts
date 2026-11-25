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
	// The new client becomes the active one and its settings page opens first.
	await expect(page).toHaveURL(/\/tenants\/[^/]+\?welcome=1$/);
	await expect(page.getByRole('heading', { name: 'Client E2E SA' })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Client actif : Client E2E SA' })).toBeVisible();
	await page.getByRole('link', { name: 'Continuer vers le tableau de bord' }).click();
	await expect(page).toHaveURL(/\/dashboard$/);
	await expect(page.getByRole('heading', { name: 'Client E2E SA', level: 1 })).toBeVisible();
	await expect(page.getByRole('link', { name: 'Paramètres', exact: true })).toBeVisible();
	await expect(page.getByRole('heading', { name: 'Premiers pas' })).toBeVisible();
});

test('the navigation separates the client from the administration', async ({ page }) => {
	await login(page);
	await page.goto('/dashboard');
	const nav = page.getByRole('navigation', { name: 'Navigation principale' });
	await expect(nav.getByRole('link', { name: 'Destinataires' })).toBeVisible();
	// Global screens sit in the Administration group of the sidebar.
	const admin = nav.getByRole('group', { name: 'Administration' });
	await expect(admin.getByRole('link', { name: 'Scénarios' })).toBeVisible();
	// Clients are managed from the switcher, not from the Administration group.
	await expect(admin.getByRole('link', { name: 'Clients' })).toHaveCount(0);
	// An operator does not see the superadmin screens.
	await expect(nav.getByRole('link', { name: 'Utilisateurs' })).toHaveCount(0);
	await expect(nav.getByRole('link', { name: 'Délivrabilité' })).toHaveCount(0);
	// Personal data is reached through the section tabs of the recipients entry, and back.
	await nav.getByRole('link', { name: 'Destinataires' }).click();
	const tabs = page.getByRole('navigation', { name: 'Pages de la section' });
	await tabs.getByRole('link', { name: 'Données personnelles (RGPD)' }).click();
	await expect(page).toHaveURL(/\/privacy$/);
	await expect(nav.getByRole('link', { name: 'Destinataires' })).toHaveAttribute(
		'aria-current',
		'page'
	);
	await tabs.getByRole('link', { name: 'Listes' }).click();
	await expect(page).toHaveURL(/\/lists$/);

	// Mobile drawer: the page behind is locked and the sheet scrolls down to the logout button.
	await page.setViewportSize({ width: 390, height: 844 });
	await page.getByRole('button', { name: 'Ouvrir la navigation' }).click();
	const drawer = page.locator('#drawer');
	await expect(drawer).toBeVisible();
	expect(await page.evaluate(() => getComputedStyle(document.body).overflow)).toBe('hidden');
	// Account actions sit in the account menu at the foot of the drawer.
	await drawer.getByRole('button', { name: /^Compte/ }).click();
	const logout = drawer.getByRole('button', { name: 'Déconnexion' });
	await logout.scrollIntoViewIfNeeded();
	await expect(logout).toBeInViewport();
	await expect(drawer.getByRole('link', { name: 'Mon compte' })).toBeVisible();
	expect(await page.evaluate(() => window.scrollY)).toBe(0);
});

test('campaign list and report for the demo data', async ({ page }) => {
	await login(page);
	await page.goto('/campaigns');
	await expect(page.getByRole('heading', { name: 'Campagnes' })).toBeVisible();
	// The active client may be one created by another test: pick the demo one.
	await page.getByRole('button', { name: /^Client actif :/ }).click();
	await page.getByRole('button', { name: 'Fiduciaire Alpina SA', exact: true }).click();
	await expect(
		page.getByRole('button', { name: 'Client actif : Fiduciaire Alpina SA' })
	).toBeVisible();
	const campaign = page.getByRole('link', { name: /Sensibilisation Q4/ }).first();
	await expect(campaign).toBeVisible();
	await campaign.click();
	await page.getByRole('link', { name: 'Rapport', exact: true }).click();
	await expect(page.getByRole('heading', { name: /Rapport de campagne/ })).toBeVisible();
	await expect(page.getByRole('row', { name: /^Destinataires 12$/ })).toBeVisible();

	// Opening the settings of another client (created above) keeps the active client.
	const active = page.getByRole('button', { name: 'Client actif : Fiduciaire Alpina SA' });
	await page.goto('/tenants');
	await page
		.getByRole('row')
		.filter({ hasText: 'Client E2E SA' })
		.getByRole('link', { name: 'Client E2E SA' })
		.click();
	await expect(page.getByRole('heading', { name: 'Client E2E SA' })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Travailler sur ce client' })).toBeVisible();
	await expect(active).toBeVisible();
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

test('a recipient list can be created then deleted from the Destinataires page', async ({
	page
}) => {
	await login(page);
	const name = `Liste E2E ${Date.now()}`;
	await page.goto('/lists');
	await page.getByLabel('Nom de la liste').fill(name);
	await page.getByRole('button', { name: 'Créer', exact: true }).click();
	const item = page.getByRole('row').filter({ hasText: name });
	await expect(item).toBeVisible();
	await item.getByRole('button', { name: 'Supprimer' }).click();
	await page.getByRole('button', { name: 'Supprimer définitivement' }).click();
	await expect(page.getByText('Liste supprimée.')).toBeVisible();
	await expect(page.getByRole('row').filter({ hasText: name })).toHaveCount(0);
});
