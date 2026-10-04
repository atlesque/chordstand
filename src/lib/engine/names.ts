import moods from '$data/moods.json';
import type { Mode, Song, Tonality } from './types';

// Only the `name` field of each style file, so the library list doesn't load the progression pools.
const styleNames = import.meta.glob<string>('/src/data/styles/*.json', { eager: true, import: 'name' });
const STYLE_NAMES: Record<string, string> = Object.fromEntries(
	Object.entries(styleNames).map(([path, name]) => [path.split('/').pop()!.replace('.json', ''), name])
);

export function styleName(id: string): string {
	return STYLE_NAMES[id] ?? id;
}

export function moodName(id: string): string {
	return (moods as Record<string, { name: string }>)[id]?.name ?? id;
}

export function tonalityOf(mode: Mode): Tonality {
	return mode === 'minor' || mode === 'dorian' ? 'minor' : 'major';
}

export function songTonalityLabel(song: Song): string {
	return `${song.settings.key}${tonalityOf(song.settings.mode) === 'minor' ? 'm' : ''}`;
}

export function songSummary(song: Song): string {
	return `${styleName(song.settings.style)} · ${moodName(song.settings.mood)} · ${songTonalityLabel(song)} · ${song.sections.length} sections`;
}
