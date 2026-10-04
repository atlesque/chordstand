import { test as base, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/** Fails the test on any console error (CSP violations show up here) or uncaught exception. */
export const test = base.extend<{ errors: string[] }>({
	errors: [
		async ({ page }, use) => {
			const errors: string[] = [];
			page.on('console', (msg) => msg.type() === 'error' && errors.push(msg.text()));
			page.on('pageerror', (err) => errors.push(err.message));
			await use(errors);
			expect(errors, 'console errors').toEqual([]);
		},
		{ auto: true }
	]
});

export { expect };

export async function expectAccessible(page: Page) {
	const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
	const summary = results.violations.map((v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(' ')).join(', ')})`);
	expect(summary).toEqual([]);
}

/** Library → setup → generate, with a fixed seed so tests are stable. */
export async function createSong(page: Page, seed = '42') {
	await page.goto('/new');
	await page.getByText('Advanced settings').click();
	await page.getByLabel('Seed').fill(seed);
	await page.getByRole('button', { name: 'Generate' }).click();
	await expect(page).toHaveURL(/\/song\/[\w-]+$/);
	await expect(page.locator('[data-section-index]')).toHaveCount(6);
}
