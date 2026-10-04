import { defineConfig, devices } from '@playwright/test';

const executablePath = process.env.CHROMIUM_PATH || undefined;

export default defineConfig({
	testDir: 'tests/e2e',
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 1 : 0,
	reporter: process.env.CI ? [['github'], ['list']] : 'list',
	use: {
		baseURL: 'http://localhost:4173',
		trace: 'retain-on-failure',
		launchOptions: { executablePath }
	},
	projects: [
		{ name: 'phone', use: { ...devices['Pixel 7'], launchOptions: { executablePath } } },
		{ name: 'phone-dark', use: { ...devices['Pixel 7'], colorScheme: 'dark', launchOptions: { executablePath } }, grep: /@a11y/ }
	],
	webServer: {
		command: 'node scripts/serve.mjs',
		url: 'http://localhost:4173',
		reuseExistingServer: !process.env.CI
	}
});
