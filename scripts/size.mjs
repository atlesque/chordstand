// Checks the first-load size budgets from the spec: JS < 50 KB and CSS < 10 KB, gzipped.
// "First load" = every script and stylesheet index.html pulls in, plus the library route's chunks.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

const BUDGET = { js: 50 * 1024, css: 10 * 1024 };
const build = 'build';
const html = readFileSync(join(build, 'index.html'), 'utf8');

const seen = new Set();
const queue = [...html.matchAll(/(?:href|src|import\()\s*=?\s*["']([^"']+\.(?:js|css))["']/g)].map((m) => m[1]);
// The SPA bootstrap imports the start + app entries; they in turn import the root layout and
// the library page. Follow static imports to get the real first-load graph.
const resolve = (from, spec) => (spec.startsWith('.') ? new URL(spec, 'http://x' + from).pathname : spec);
while (queue.length) {
	const path = queue.shift();
	const clean = path.replace(/^\.\//, '/').replace(/^(?!\/)/, '/');
	if (seen.has(clean)) continue;
	seen.add(clean);
	if (!clean.endsWith('.js')) continue;
	const src = readFileSync(join(build, clean), 'utf8');
	for (const m of src.matchAll(/(?:from|import)\s*["']([^"']+\.js)["']/g)) queue.push(resolve(clean, m[1]));
}

// The app entry loads route nodes dynamically; add the root layout (node 0) and the library page (node 2).
const nodesDir = join(build, '_app/immutable/nodes');
for (const f of readdirSync(nodesDir).filter((f) => /^[02]\./.test(f))) {
	const p = `/_app/immutable/nodes/${f}`;
	queue.push(p);
}
while (queue.length) {
	const clean = queue.shift();
	if (seen.has(clean)) continue;
	seen.add(clean);
	const src = readFileSync(join(build, clean), 'utf8');
	for (const m of src.matchAll(/(?:from|import)\s*["']([^"']+\.js)["']/g)) queue.push(resolve(clean, m[1]));
}
// CSS chunks are referenced from the node files.
const cssFiles = new Set();
for (const p of seen) {
	if (p.endsWith('.css')) cssFiles.add(p);
	if (!p.endsWith('.js')) continue;
	const src = readFileSync(join(build, p), 'utf8');
	for (const m of src.matchAll(/["']([^"']*assets\/[^"']+\.css)["']/g)) cssFiles.add('/_app/immutable/' + m[1].replace(/^.*?assets\//, 'assets/'));
}

let js = 0;
let css = 0;
for (const p of seen) if (p.endsWith('.js')) js += gzipSync(readFileSync(join(build, p))).length;
for (const p of cssFiles) {
	try {
		css += gzipSync(readFileSync(join(build, p))).length;
	} catch {
		/* not a real file */
	}
}
const kb = (n) => (n / 1024).toFixed(1) + ' KB';
console.log(`First-load JS:  ${kb(js)} gzip (budget ${kb(BUDGET.js)}) from ${[...seen].filter((p) => p.endsWith('.js')).length} files`);
console.log(`First-load CSS: ${kb(css)} gzip (budget ${kb(BUDGET.css)}) from ${cssFiles.size} files`);
if (js > BUDGET.js || css > BUDGET.css) {
	console.error('Size budget exceeded');
	process.exit(1);
}
