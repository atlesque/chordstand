import { newId } from './defaults';
import type { Song } from './types';

export function setTitle(song: Song, title: string): Song {
	const t = title.trim().slice(0, 80);
	return t ? { ...song, title: t, updatedAt: new Date().toISOString() } : song;
}

export function duplicateSong(song: Song, title?: string): Song {
	const now = new Date().toISOString();
	return { ...(JSON.parse(JSON.stringify(song)) as Song), id: newId(), title: title ?? `${song.title} (copy)`, createdAt: now, updatedAt: now };
}
