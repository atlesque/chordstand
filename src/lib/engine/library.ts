import type { LibraryFile, LibrarySong } from './library-check';
import type { StyleId } from './types';

export type { LibrarySong } from './library-check';

// One lazy chunk per style, fetched only when a song is generated, so the library never
// touches the first-load bundle. The service worker precaches the chunks for offline use.
const files = import.meta.glob<LibraryFile>('/src/data/library/*.json', { import: 'default' });

const pathOf = (style: StyleId) => `/src/data/library/${style}.json`;

export function hasLibrary(style: StyleId): boolean {
	return pathOf(style) in files;
}

export async function loadLibrary(style: StyleId): Promise<LibrarySong[]> {
	const load = files[pathOf(style)];
	if (!load) return [];
	try {
		return (await load()).songs ?? [];
	} catch {
		// Offline before the chunk was cached: fall back to the rule-based generator.
		return [];
	}
}

/** Styles that ship a library file. */
export function libraryStyles(): StyleId[] {
	return Object.keys(files).map((p) => p.split('/').pop()!.replace('.json', '') as StyleId);
}
