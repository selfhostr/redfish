import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defineConfig, devices } from '@playwright/test';

const port = 4173;
// Throwaway database, deleted and recreated on each run by e2e/start.sh.
const dbPath = join(tmpdir(), `redfish-e2e-${port}.db`);
// Tests read the database (tracking token): expose its path to the workers.
process.env.E2E_DB = dbPath;

export default defineConfig({
	testDir: './e2e',
	testMatch: '**/*.spec.ts',
	fullyParallel: false,
	workers: 1,
	retries: process.env.CI ? 1 : 0,
	reporter: process.env.CI ? 'github' : 'list',
	use: { baseURL: `http://127.0.0.1:${port}`, trace: 'retain-on-failure' },
	projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
	webServer: {
		command: './e2e/start.sh',
		url: `http://127.0.0.1:${port}/health`,
		timeout: 240_000,
		reuseExistingServer: false,
		env: {
			DATABASE_URL: `file:${dbPath}`,
			PORT: String(port),
			HOST: '127.0.0.1',
			// Required by adapter-node's CSRF protection over plain http.
			ORIGIN: `http://127.0.0.1:${port}`,
			// Test-only key (never a production value).
			REDFISH_SECRET_KEY: '00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff'
		}
	}
});
