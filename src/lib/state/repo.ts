import { browser } from '$app/environment';
import { SongRepo } from '$lib/storage/repo';

let instance: SongRepo | null = null;

/** The one song repository for this tab (localStorage, or memory when blocked). */
export function repo(): SongRepo {
	if (!instance) instance = new SongRepo(browser ? undefined : null);
	return instance;
}
