import { browser } from '$app/environment';
import { SongRepo } from '$lib/storage/repo';

/** Set while signed in to Atlesque Play (see $lib/sync/account.svelte.ts). */
export const ACCOUNT_KEY = 'chordstand:v1:account';

export function signedIn(): boolean {
	try {
		return localStorage.getItem(ACCOUNT_KEY) !== null;
	} catch {
		return false;
	}
}

/** The Atlesque Play sync code, loaded only for someone signed in or signing in. */
export const syncCode = () => import('$lib/sync/account.svelte');

let instance: SongRepo | null = null;

/** The one song repository for this tab (localStorage, or memory when blocked). */
export function repo(): SongRepo {
	if (!instance) {
		instance = new SongRepo(browser ? undefined : null);
		// Signed in, every change is also queued for sync.
		instance.onchange = (id, deleted) => {
			if (signedIn()) syncCode().then((m) => m.noteChange(id, deleted));
		};
	}
	return instance;
}
