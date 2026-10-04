// Serves build/ the way Cloudflare will: headers from _headers and the SPA fallback.
// Used by `npm run preview`, the Playwright tests and Lighthouse CI.
import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { gzipSync } from 'node:zlib';

const root = 'build';
const port = Number(process.env.PORT || 4173);
const types = {
	'.html': 'text/html; charset=utf-8',
	'.js': 'text/javascript; charset=utf-8',
	'.css': 'text/css; charset=utf-8',
	'.json': 'application/json',
	'.webmanifest': 'application/manifest+json',
	'.svg': 'image/svg+xml',
	'.png': 'image/png',
	'.txt': 'text/plain; charset=utf-8'
};

function parseHeaders() {
	const file = join(root, '_headers');
	if (!existsSync(file)) return [];
	const rules = [];
	let current = null;
	for (const line of readFileSync(file, 'utf8').split('\n')) {
		if (!line.trim() || line.trim().startsWith('#')) continue;
		if (!/^\s/.test(line)) {
			current = { pattern: line.trim(), headers: {} };
			rules.push(current);
		} else if (current) {
			const i = line.indexOf(':');
			current.headers[line.slice(0, i).trim()] = line.slice(i + 1).trim();
		}
	}
	return rules;
}
const matches = (pattern, path) =>
	new RegExp('^' + pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$').test(path);

createServer((req, res) => {
	const rules = parseHeaders(); // re-read so a rebuild never serves stale CSP hashes
	const url = new URL(req.url ?? '/', 'http://localhost');
	let path = decodeURIComponent(url.pathname);
	let file = normalize(join(root, path));
	if (!file.startsWith(root)) {
		res.writeHead(400).end();
		return;
	}
	if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
	if (!existsSync(file)) {
		file = join(root, 'index.html'); // SPA fallback (wrangler.jsonc not_found_handling)
		path = '/index.html';
	}
	const headers = { 'Content-Type': types[extname(file)] ?? 'application/octet-stream' };
	for (const rule of rules) if (matches(rule.pattern, url.pathname) || matches(rule.pattern, path)) Object.assign(headers, rule.headers);
	const csp = rules.find((r) => r.pattern === '/*')?.headers['Content-Security-Policy'];
	// upgrade-insecure-requests would break plain-http localhost testing.
	if (csp) headers['Content-Security-Policy'] = csp.replace(/;\s*upgrade-insecure-requests/, '');
	let body = readFileSync(file);
	// Cloudflare compresses text responses; do the same so Lighthouse measures what users get.
	if (/text|javascript|json|svg|manifest/.test(headers['Content-Type']) && /gzip/.test(req.headers['accept-encoding'] ?? '')) {
		body = gzipSync(body);
		headers['Content-Encoding'] = 'gzip';
		headers['Vary'] = 'Accept-Encoding';
	}
	res.writeHead(200, headers);
	res.end(body);
}).listen(port, () => console.log(`Serving ${root}/ on http://localhost:${port}`));
