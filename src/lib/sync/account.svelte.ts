import { repo, showToast } from '$lib/state/app.svelte';
import { ACCOUNT_KEY } from '$lib/state/repo';
import { TOMBSTONE_MS, decodeSave, encodeSave, merge, sameEntries, type Entries } from './merge';

// Optional Atlesque Play account. Songs are always saved in this browser first; signed in, the library
// is also kept on Atlesque Play (play.atlesque.dev, the mbp-games Worker) and merged with other devices.
// This module is loaded only when someone is signed in or signs in, so it stays out of the first load.

export const PLAY_URL = (import.meta.env.VITE_PLAY_URL as string | undefined) ?? 'https://play.atlesque.dev';
const CLIENT = 'chordstand';
const PENDING_KEY = 'chordstand:v1:signin';
const PROGRESS = `${PLAY_URL}/api/games/${CLIENT}/progress`;
/** Edits are gathered for this long before they go up, so a busy editing session makes few requests. */
const PUSH_DELAY_MS = 10_000;
/** Coming back to the tab pulls other devices' changes, at most this often. */
const PULL_EVERY_MS = 60_000;

type Meta = {
	token: string;
	email: string;
	/** The account's save revision this browser last read or wrote. */
	rev: number;
	syncedAt: number | null;
	/** When each song last changed here (songs not listed fall back to their updatedAt). */
	at: Record<string, number>;
	/** Songs deleted here, and when. */
	gone: Record<string, number>;
};

type Pending = { verifier: string; state: string; redirect: string };

export const account = $state<{ email: string | null; busy: boolean; error: string | null; syncedAt: number | null }>({
	email: null,
	busy: false,
	error: null,
	syncedAt: null
});

function read<T>(key: string): T | null {
	try {
		return JSON.parse(localStorage.getItem(key) ?? 'null');
	} catch {
		return null;
	}
}

function write(key: string, value: unknown) {
	try {
		if (value === null) localStorage.removeItem(key);
		else localStorage.setItem(key, JSON.stringify(value));
	} catch {
		/* storage blocked: the account just won't be remembered */
	}
}

const readMeta = () => read<Meta>(ACCOUNT_KEY);

function show(meta: Meta | null) {
	account.email = meta?.email ?? null;
	account.syncedAt = meta?.syncedAt ?? null;
}

class ApiError extends Error {
	constructor(
		readonly status: number,
		readonly body: Record<string, unknown>
	) {
		super(typeof body.message === 'string' ? body.message : `Atlesque Play answered ${status}`);
	}
}

async function api(url: string, token: string | null, method = 'GET', body?: unknown) {
	const res = await fetch(url, {
		method,
		headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
		body: body === undefined ? undefined : JSON.stringify(body)
	});
	const data = await res.json().catch(() => ({}));
	if (!res.ok) throw new ApiError(res.status, data);
	return data;
}

// ---- sign-in (PKCE, like every Atlesque Play game) ----

const b64url = (bytes: Uint8Array) =>
	btoa(String.fromCharCode(...bytes))
		.replace(/\+/g, '-')
		.replace(/\//g, '_')
		.replace(/=+$/, '');
const random = (n: number) => b64url(crypto.getRandomValues(new Uint8Array(n)));

/** Off to the hosted sign-in page; it sends the player back to the library with a one-time code. */
export async function signIn() {
	const verifier = random(48);
	const state = random(16);
	const redirect = `${location.origin}/`;
	const challenge = b64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
	write(PENDING_KEY, { verifier, state, redirect } satisfies Pending);
	location.assign(
		`${PLAY_URL}/signin?` + new URLSearchParams({ client: CLIENT, redirect_uri: redirect, state, code_challenge: challenge })
	);
}

async function finishSignIn(code: string, state: string | null) {
	const url = new URL(location.href);
	url.searchParams.delete('mbpg_code');
	url.searchParams.delete('mbpg_state');
	history.replaceState(history.state, '', url);
	const pending = read<Pending>(PENDING_KEY);
	write(PENDING_KEY, null);
	if (!pending || pending.state !== state) {
		showToast('That sign-in was started in another browser. Sign in again here.');
		return;
	}
	try {
		const r = await api(`${PLAY_URL}/api/token`, null, 'POST', {
			code,
			code_verifier: pending.verifier,
			client: CLIENT,
			redirect_uri: pending.redirect
		});
		write(ACCOUNT_KEY, { token: r.token, email: r.user.email, rev: 0, syncedAt: null, at: {}, gone: {} } satisfies Meta);
		show(readMeta());
		const n = await sync(true);
		showToast(`Signed in as ${r.user.email}. ${n === null ? 'Your songs will sync when you are back online.' : 'Your songs are synced.'}`);
	} catch (err) {
		showToast(err instanceof Error ? err.message : 'Signing in failed. Try again.');
	}
}

/** Signing out keeps every song in this browser; they just stop syncing. */
export async function signOut() {
	const meta = readMeta();
	clearTimeout(timer);
	write(ACCOUNT_KEY, null);
	show(null);
	account.error = null;
	if (meta) await api(`${PLAY_URL}/api/logout`, meta.token, 'POST', {}).catch(() => {});
}

// ---- sync ----

function localEntries(meta: Meta): Entries {
	const out: Entries = new Map();
	for (const song of repo().all()) {
		out.set(song.id, { id: song.id, at: meta.at[song.id] ?? (Date.parse(song.updatedAt) || 0), song });
	}
	for (const [id, at] of Object.entries(meta.gone)) if (!out.has(id)) out.set(id, { id, at });
	return out;
}

/** Writes what came from other devices into this browser, unless it changed here meanwhile. */
function apply(merged: Entries, local: Entries): number {
	const meta = readMeta();
	if (!meta) return 0;
	let changed = 0;
	for (const [id, entry] of merged) {
		const mine = local.get(id);
		// Edited here while the request was out: keep this copy, the next sync sends it.
		if (Math.max(meta.at[id] ?? 0, meta.gone[id] ?? 0) > entry.at) continue;
		if (entry.song && (!mine?.song || mine.at !== entry.at)) {
			repo().save(entry.song, true);
			changed++;
		} else if (!entry.song && mine?.song) {
			repo().delete(id, true);
			changed++;
		}
		if (entry.song) {
			meta.at[id] = entry.at;
			delete meta.gone[id];
		} else {
			meta.gone[id] = entry.at;
			delete meta.at[id];
		}
	}
	// Tombstones the merge dropped as too old to matter go here too.
	for (const id of Object.keys(meta.gone)) if (!merged.has(id) && Date.now() - meta.gone[id] > TOMBSTONE_MS) delete meta.gone[id];
	write(ACCOUNT_KEY, meta);
	return changed;
}

const listeners = new Set<() => void>();
/** Called when songs arrived from another device, so a page can redraw its list. */
export function onPulled(fn: () => void) {
	listeners.add(fn);
	return () => listeners.delete(fn);
}

let running: Promise<number | null> | null = null;
let again = false;
let timer: ReturnType<typeof setTimeout> | undefined;
let lastPull = 0;

/**
 * Merges this browser's library with the account's. `pull` reads the account's copy first; otherwise the
 * local library goes straight up, and the server answers with its copy only if another device got there first.
 * Returns how many songs changed here, or null when it couldn't reach Atlesque Play.
 */
export function sync(pull = false): Promise<number | null> {
	clearTimeout(timer);
	timer = undefined;
	if (running) {
		again = true;
		return running;
	}
	running = run(pull).finally(() => {
		running = null;
		if (again) {
			again = false;
			schedule(0);
		}
	});
	return running;
}

async function run(pull: boolean): Promise<number | null> {
	let meta = readMeta();
	if (!meta) return 0;
	account.busy = true;
	try {
		let remote: Entries | null = null;
		let rev = meta.rev;
		if (pull || rev === 0) {
			const r = await api(PROGRESS, meta.token);
			remote = await decodeSave(r.data);
			rev = r.rev;
			lastPull = Date.now();
		}
		let pulled = 0;
		for (let attempt = 0; attempt < 4; attempt++) {
			const local = localEntries(meta);
			const merged = remote ? merge(local, remote) : local;
			pulled += apply(merged, local);
			if (remote && sameEntries(merged, remote)) break;
			try {
				rev = (await api(PROGRESS, meta.token, 'PUT', { data: await encodeSave(merged), rev })).rev;
				break;
			} catch (err) {
				// Another device saved since we last looked: merge with its copy and try again.
				if (!(err instanceof ApiError) || err.status !== 409) throw err;
				remote = await decodeSave(err.body.data);
				rev = err.body.rev as number;
			}
			meta = readMeta();
			if (!meta) return 0;
		}
		meta = readMeta();
		if (!meta) return pulled;
		write(ACCOUNT_KEY, { ...meta, rev, syncedAt: Date.now() });
		show(readMeta());
		account.error = null;
		if (pulled) for (const fn of listeners) fn();
		return pulled;
	} catch (err) {
		if (!(err instanceof ApiError)) {
			account.error = 'Offline. Your songs are saved here and will sync when you are back online.';
			return null;
		}
		if (err.status === 401) {
			write(ACCOUNT_KEY, null);
			show(null);
			account.error = 'You were signed out of Atlesque Play. Sign in again to keep syncing.';
		} else if (err.status === 413) {
			account.error = 'Your library is too big to sync. Export a backup and delete songs you no longer need.';
		} else {
			account.error = err.message;
		}
		return 0;
	} finally {
		account.busy = false;
	}
}

function schedule(ms = PUSH_DELAY_MS) {
	clearTimeout(timer);
	timer = setTimeout(() => sync(), ms);
}

/** The repo calls this (through state/repo.ts) for every save and delete while signed in. */
export function noteChange(id: string, deleted: boolean) {
	const meta = readMeta();
	if (!meta) return;
	const now = Date.now();
	if (deleted) {
		meta.gone[id] = now;
		delete meta.at[id];
	} else {
		meta.at[id] = now;
		delete meta.gone[id];
	}
	write(ACCOUNT_KEY, meta);
	schedule();
}

let started = false;

/** Runs once per tab: finishes a sign-in coming back from Atlesque Play, or syncs an existing one. */
export function start() {
	if (started) return;
	started = true;
	show(readMeta());
	const q = new URLSearchParams(location.search);
	const code = q.get('mbpg_code');
	if (code) void finishSignIn(code, q.get('mbpg_state'));
	else if (readMeta()) void sync(true);
	addEventListener('online', () => readMeta() && sync(true));
	document.addEventListener('visibilitychange', () => {
		if (!readMeta()) return;
		// Leaving the tab: send what's waiting. Coming back: pick up other devices' changes.
		if (document.visibilityState === 'hidden') {
			if (timer) sync();
		} else if (Date.now() - lastPull > PULL_EVERY_MS) sync(true);
	});
}
