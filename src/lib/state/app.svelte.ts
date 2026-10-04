import { browser } from '$app/environment';
import { DEFAULT_SETUP } from '$lib/engine/defaults';
import type { SetupChoices } from '$lib/engine/types';

// App-wide UI state. Deliberately free of engine and storage imports so the shell stays small.

export { repo } from './repo';

export type Theme = 'system' | 'light' | 'dark';

export type Prefs = {
	theme: Theme;
	wakeLock: boolean;
	showNumerals: boolean;
	autoAdvance: boolean;
	lastSetup: SetupChoices;
};

export const PREFS_KEY = 'chordstand:v1:prefs';

export const DEFAULT_PREFS: Prefs = {
	theme: 'system',
	wakeLock: true,
	showNumerals: false,
	autoAdvance: false,
	lastSetup: DEFAULT_SETUP
};

function loadPrefs(): Prefs {
	if (!browser) return DEFAULT_PREFS;
	try {
		const parsed = JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}');
		if (!parsed || typeof parsed !== 'object') return DEFAULT_PREFS;
		return { ...DEFAULT_PREFS, ...parsed, lastSetup: { ...DEFAULT_SETUP, ...parsed.lastSetup } };
	} catch {
		return DEFAULT_PREFS;
	}
}

export const prefs = $state<Prefs>(loadPrefs());

export function savePrefs() {
	try {
		localStorage.setItem(PREFS_KEY, JSON.stringify($state.snapshot(prefs)));
	} catch {
		/* storage blocked or full: prefs just won't persist */
	}
}

export function applyTheme(theme: Theme) {
	if (!browser) return;
	const root = document.documentElement;
	if (theme === 'system') delete root.dataset.theme;
	else root.dataset.theme = theme;
}

/** Polite screen-reader announcements, e.g. "Chorus moved to position 3". */
export const live = $state({ message: '' });

export function announce(message: string) {
	live.message = '';
	// Clearing first makes repeated identical messages announce again.
	queueMicrotask(() => (live.message = message));
}

export type Toast = { id: number; message: string; action?: { label: string; run: () => void } };
export const toasts = $state<{ current: Toast | null }>({ current: null });
let toastTimer: ReturnType<typeof setTimeout> | undefined;
let toastSeq = 0;

export function showToast(message: string, action?: Toast['action'], ms = 6000) {
	clearTimeout(toastTimer);
	toasts.current = { id: ++toastSeq, message, action };
	toastTimer = setTimeout(() => (toasts.current = null), ms);
}

export function dismissToast() {
	clearTimeout(toastTimer);
	toasts.current = null;
}

/** Ask the browser not to evict our data. Called once; harmless if unsupported. */
export async function requestPersistence(): Promise<boolean> {
	try {
		if (navigator.storage?.persisted && (await navigator.storage.persisted())) return true;
		return (await navigator.storage?.persist?.()) ?? false;
	} catch {
		return false;
	}
}
