// Renders the PNG app icons from static/favicon.svg with Playwright's Chromium.
// Run after changing the icon: npm run icons
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';

const svg = readFileSync('static/favicon.svg', 'utf8');
const maskable = svg
	.replace('rx="112"', 'rx="0"')
	.replace('<rect x="104"', '<g transform="translate(51.2 51.2) scale(0.8)"><rect x="104"')
	.replace('</svg>', '</g></svg>');

const targets = [
	{ file: 'static/icons/icon-192.png', size: 192, svg },
	{ file: 'static/icons/icon-512.png', size: 512, svg },
	{ file: 'static/icons/icon-maskable-512.png', size: 512, svg: maskable },
	{ file: 'static/icons/apple-touch-icon.png', size: 180, svg: maskable }
];

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const page = await browser.newPage();
for (const t of targets) {
	await page.setViewportSize({ width: t.size, height: t.size });
	await page.setContent(
		`<html><body style="margin:0;background:transparent">${t.svg.replace('<svg ', `<svg width="${t.size}" height="${t.size}" `)}</body></html>`
	);
	await page.screenshot({ path: t.file, omitBackground: true });
	console.log('wrote', t.file);
}
await browser.close();
