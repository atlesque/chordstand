// Writes build/_headers for Cloudflare Pages: caching rules plus a strict CSP.
// The CSP allows only our own scripts, plus the exact inline scripts in index.html (by hash),
// so it is regenerated on every build.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

const html = readFileSync('build/index.html', 'utf8');
const hashes = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)]
	.map((m) => m[1])
	.filter((body) => body.trim().length > 0)
	.map((body) => `'sha256-${createHash('sha256').update(body).digest('base64')}'`);

const csp = [
	"default-src 'self'",
	`script-src 'self' ${hashes.join(' ')}`.trim(),
	"style-src 'self' 'unsafe-inline'",
	"img-src 'self' data: blob:",
	"font-src 'self'",
	"connect-src 'self'",
	"manifest-src 'self'",
	"worker-src 'self'",
	"object-src 'none'",
	"base-uri 'self'",
	"form-action 'self'",
	"frame-ancestors 'none'",
	'upgrade-insecure-requests'
].join('; ');

const headers = `/*
  Content-Security-Policy: ${csp}
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=(), screen-wake-lock=(self), fullscreen=(self)
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  Cross-Origin-Opener-Policy: same-origin

/_app/immutable/*
  Cache-Control: public, max-age=31536000, immutable

/index.html
  Cache-Control: no-cache

/
  Cache-Control: no-cache

/sw.js
  Cache-Control: no-cache

/workbox-*
  Cache-Control: no-cache

/manifest.webmanifest
  Cache-Control: no-cache
`;

writeFileSync('build/_headers', headers);
console.log(`postbuild: wrote build/_headers (${hashes.length} inline script hash${hashes.length === 1 ? '' : 'es'})`);
