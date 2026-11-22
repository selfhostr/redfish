/**
 * Captures the screens used in the documentation and on the website, from the
 * fictional data of scripts/seed-screenshots.ts. Run with `npm run screenshots`
 * (or scripts/screenshots-docker.sh, which brings its own Chromium).
 *
 * Output: $SHOTS_DIR (default screenshots/out) / <name>[-dark]-<width>.webp,
 * at 700, 1000, 1400 and 2000 px wide, from a 1440x900 viewport at 2x.
 * SHOTS_SCHEMES chooses the colour schemes (default "dark": the interface has a
 * single dark theme, so a light capture is identical; use "light,dark" for both).
 */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import Database from 'better-sqlite3';
import sharp from 'sharp';

const PASSWORD = 'screenshots-demo-1234';
const OUT = process.env.SHOTS_DIR ?? 'screenshots/out';
const WIDTHS = [700, 1000, 1400, 2000];
const SCHEMES = (process.env.SHOTS_SCHEMES ?? 'dark')
	.split(',')
	.map((s) => s.trim())
	.filter((s): s is 'light' | 'dark' => s === 'light' || s === 'dark');

mkdirSync(OUT, { recursive: true });

function query<T>(sql: string): T {
	const db = new Database(process.env.E2E_DB!, { readonly: true });
	try {
		return db.prepare(sql).get() as T;
	} finally {
		db.close();
	}
}

async function login(page: Page, email: string) {
	await page.goto('/login');
	await page.getByLabel('E-mail').fill(email);
	await page.getByLabel('Mot de passe').fill(PASSWORD);
	await page.getByRole('button', { name: 'Se connecter' }).click();
	await expect(page).not.toHaveURL(/\/login/);
}

async function chooseClient(page: Page, name: string) {
	// Client switcher at the start of the bar: only switch when another client is active.
	const current = page.getByRole('button', { name: `Client actif : ${name}` });
	if (await current.count()) return;
	await page.getByRole('button', { name: /^Client actif :/ }).click();
	await page.getByRole('button', { name, exact: true }).click();
	await expect(current).toBeVisible();
}

async function save(page: Page, name: string, scheme: 'light' | 'dark') {
	// Let fonts, charts and transitions settle; hide the caret and the scrollbars.
	await page.evaluate(() => document.fonts.ready);
	await page.addStyleTag({
		content: '*{caret-color:transparent!important} ::-webkit-scrollbar{display:none}'
	});
	await page.waitForTimeout(400);
	const png = await page.screenshot({ animations: 'disabled' });
	const base = scheme === 'dark' && SCHEMES.length > 1 ? `${name}-dark` : name;
	for (const w of WIDTHS) {
		await sharp(png)
			.resize({ width: w })
			.webp({ quality: 82, effort: 6 })
			.toFile(join(OUT, `${base}-${w}.webp`));
	}
}

const MAIN = 'Fiduciaire Démo Lémanique SA';

for (const scheme of SCHEMES) {
	test.describe(`${scheme} scheme`, () => {
		test.use({ colorScheme: scheme });

		test('operator screens', async ({ page }) => {
			await login(page, 'operateur@demo.example');
			await chooseClient(page, MAIN);

			await page.goto('/dashboard');
			await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
			await save(page, 'dashboard', scheme);

			// The funnel of the latest campaign and the client's progression chart, further down.
			const funnel = page.getByText('Entonnoir de la campagne mise en avant');
			await expect(funnel).toBeVisible();
			await funnel.evaluate((el) =>
				window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 32)
			);
			await save(page, 'funnel', scheme);
			await page.evaluate(() => window.scrollTo(0, 0));

			const tenant = query<{ id: string }>(`select id from tenants where name = '${MAIN}'`);
			await page.goto(`/tenants/${tenant.id}`);
			await expect(page.getByRole('heading', { name: MAIN })).toBeVisible();
			await save(page, 'client', scheme);

			await page.goto('/account');
			const start = page.getByRole('button', { name: 'Activer la double authentification' });
			if (await start.isVisible()) await start.click();
			await expect(page.getByAltText("QR code d'enrôlement TOTP")).toBeVisible();
			await save(page, 'account', scheme);
		});

		test('scenario editor with live preview', async ({ page }) => {
			await login(page, 'admin@demo.example');
			await page.goto('/scenarios/new');
			await page.locator('input[name="key"]').fill('rappel-formation');
			await page.locator('input[name="title"]').fill('Rappel de formation obligatoire');
			await page.locator('input[name="fromName"]').fill('Service RH');
			await page
				.locator('input[name="subject"]')
				.fill('Rappel : formation sécurité à suivre avant vendredi, {{firstName}}');
			const email = query<{ email: string }>(
				`select email_template as email from scenarios where key = 'politique-teletravail'`
			);
			await page.locator('textarea[name="email"]').fill(email.email);
			await page.waitForLoadState('networkidle');
			// Open the rendered e-mail in the live preview, then go back to the top of the page.
			await page.getByRole('tab', { name: 'E-mail', exact: true }).click();
			await page.waitForTimeout(1500);
			await page.evaluate(() => window.scrollTo(0, 0));
			await save(page, 'editor', scheme);
		});

		test('awareness page seen by a target', async ({ page }) => {
			const row = query<{ token: string }>(
				`select r.token from campaign_recipients r join campaigns c on c.id = r.campaign_id
				 join tenants t on t.id = c.tenant_id
				 where t.name = '${MAIN}' and c.status = 'completed'
				 order by c.created_at desc limit 1`
			);
			await page.goto(`/t/a/${row.token}`);
			await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
			await save(page, 'awareness', scheme);
		});
	});
}
