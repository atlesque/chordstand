import { parseSong } from './schema';
import type { Song } from '$lib/engine/types';

export type ExportFile = { app: 'chordstand'; version: 1; exportedAt: string; songs: Song[] };

export function buildExport(songs: Song[]): ExportFile {
	return { app: 'chordstand', version: 1, exportedAt: new Date().toISOString(), songs };
}

export function exportFileName(songs: Song[]): string {
	const date = new Date().toISOString().slice(0, 10);
	if (songs.length === 1) {
		const slug = songs[0].title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'song';
		return `chordstand-${slug}-${date}.json`;
	}
	return `chordstand-library-${date}.json`;
}

/** Accepts an export file, an array of songs or a single song. Invalid songs are counted, not thrown. */
export function parseImport(text: string): { songs: Song[]; skipped: number } {
	let data: unknown;
	try {
		data = JSON.parse(text);
	} catch {
		return { songs: [], skipped: 1 };
	}
	const items: unknown[] = Array.isArray(data)
		? data
		: data && typeof data === 'object' && Array.isArray((data as ExportFile).songs)
			? (data as ExportFile).songs
			: [data];
	const songs: Song[] = [];
	let skipped = 0;
	for (const item of items) {
		const song = parseSong(item);
		if (song) songs.push(song);
		else skipped++;
	}
	return { songs, skipped };
}

export function downloadJson(data: unknown, fileName: string) {
	const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = fileName;
	document.body.append(a);
	a.click();
	a.remove();
	setTimeout(() => URL.revokeObjectURL(url), 1000);
}
