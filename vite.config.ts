import { sveltekit } from '@sveltejs/kit/vite';
import { SvelteKitPWA } from '@vite-pwa/sveltekit';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	plugins: [
		sveltekit(),
		SvelteKitPWA({
			registerType: 'autoUpdate',
			injectRegister: false,
			manifest: false, // static/manifest.webmanifest is the source of truth
			workbox: {
				globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'],
				navigateFallback: '/index.html',
				navigateFallbackDenylist: [/^\/sw\.js$/, /^\/workbox-/]
			},
			kit: { spa: true, adapterFallback: 'index.html' }
		})
	],
	test: {
		include: ['tests/unit/**/*.test.ts']
	}
});
