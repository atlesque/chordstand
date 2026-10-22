// Checks the first-load size budgets from the spec: JS < 50 KB and CSS < 10 KB, gzipped.
// "First load" = every script and stylesheet index.html pulls in, plus the library route's chunks.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

const BUDGET = { js: 50 * 1024, css: 10 * 1024 };
const build = 'build';
const html = readFileSync(join(build, 'index.html'), 'utf8');

const seen = new Set();
// External scripts (the shared consent banner on tools.atlesque.dev) aren't part of this app's bundle.
const queue = [...html.matchAll(/(?:href|src|import\()\s*=?\s*["']([^"']+\.(?:js|css))["']/g)]
	.map((m) => m[1])
	.filter((p) => !/^https?:\/\//.test(p));
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
// CSS: what index.html links, plus the stylesheets the app entry preloads with the root layout
// and the library page. The entry lists every route's CSS in one map, so read just those two nodes'
// dependency lists rather than every .css it mentions.
const cssFiles = new Set([...html.matchAll(/href="([^"]+\.css)"/g)].map((m) => m[1]));
for (const p of seen) {
	if (!p.includes('/entry/app.')) continue;
	const src = readFileSync(join(build, p), 'utf8');
	const deps = JSON.parse(src.match(/m\.f=(\[[^\]]*\])/)?.[1] ?? '[]');
	for (const m of src.matchAll(/import\("\.\.\/nodes\/([02])\.[^"]+"\),__vite__mapDeps\(\[([\d,]+)\]\)/g)) {
		for (const i of m[2].split(',')) if (deps[i]?.endsWith('.css')) cssFiles.add('/_app/immutable/' + deps[i].replace(/^\.\.\//, ''));
	}
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
