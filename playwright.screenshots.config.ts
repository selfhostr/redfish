import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defineConfig } from '@playwright/test';

// Documentation and website screenshots: `npm run screenshots` (or scripts/screenshots-docker.sh).
// Same throwaway server as the end-to-end tests, seeded with fictional data (scripts/seed-screenshots.ts).
const port = 4174;
const dbPath = join(tmpdir(), `redfish-screenshots-${port}.db`);
process.env.E2E_DB = dbPath;

export default defineConfig({
	testDir: './e2e',
	testMatch: 'screenshots.ts',
	fullyParallel: false,
	workers: 1,
	timeout: 120_000,
	reporter: 'list',
	use: {
		baseURL: `http://127.0.0.1:${port}`,
		viewport: { width: 1440, height: 900 },
		deviceScaleFactor: 2,
		locale: 'fr-CH',
		timezoneId: 'Europe/Zurich'
	},
	webServer: {
		command: './e2e/start.sh',
		url: `http://127.0.0.1:${port}/health`,
		timeout: 240_000,
		reuseExistingServer: false,
		env: {
			DEMO_SEED: 'db:seed:screenshots',
			DATABASE_URL: `file:${dbPath}`,
			PORT: String(port),
			HOST: '127.0.0.1',
			ORIGIN: `http://127.0.0.1:${port}`,
			// Throwaway key for the throwaway database (never a production value).
			REDFISH_SECRET_KEY: '00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff'
		}
	}
});
