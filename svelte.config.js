import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),
	kit: {
		// Fully static SPA: every route falls back to index.html (see static/_redirects).
		adapter: adapter({ pages: 'build', assets: 'build', fallback: 'index.html', strict: true }),
		alias: { $data: 'src/data' },
		serviceWorker: { register: false }
	}
};

export default config;
