import { describe, expect, it } from 'vitest';
import { fuzzyMatch, highlight, indexSong, searchSongs } from '$lib/engine/search';
import type { LibrarySong } from '$lib/engine/library-check';

const song = (name: string, over: Partial<LibrarySong> = {}): LibrarySong => ({
	id: name,
	name,
	mood: 'happy',
	complexity: 2,
	mode: 'major',
	form: ['Intro', 'Verse', 'Chorus', 'Outro'],
	parts: { intro: 'I|IV|I|V', verse: 'I|iii|vi|IV|I|iii|IV|V', chorus: 'IV|V|I|vi|IV|V|I IV|I', outro: 'IV|V|I|I' },
	...over
});
const items = [
	indexSong(song('Golden Hour Run'), 'pop', ['Pop', 'pop', 'Happy', 'major', 'Easy', 'Intro', 'Verse', 'Chorus', 'Outro']),
	indexSong(song('Lemonade Weekend', { mode: 'mixolydian', parts: { ...song('x').parts, verse: 'I|bVII|IV|I|I|bVII|IV|IV' } }), 'pop', [
		'Pop',
		'pop',
		'Happy',
		'Mixolydian',
		'Easy',
		'Verse'
	]),
	indexSong(song('Blue Smoke Waltz', { mood: 'melancholic' }), 'jazz', ['Jazz', 'jazz', 'Melancholic', 'minor', 'Rich', 'Bridge'])
];
const names = (q: string) => searchSongs(items, q).map((r) => r.item.song.name);

describe('fuzzy matching', () => {
	it('ranks a word-start substring above a mid-word one', () => {
		expect(fuzzyMatch('hour', 'golden hour run')!.score).toBeGreaterThan(fuzzyMatch('our', 'golden hour run')!.score);
	});
	it('matches scattered letters and single typos', () => {
		expect(fuzzyMatch('gldn', 'golden hour run')).not.toBeNull();
		expect(fuzzyMatch('lemnoade', 'lemonade weekend')).not.toBeNull();
		expect(fuzzyMatch('zzz', 'golden hour run')).toBeNull();
	});
	it('marks the matched letters', () => {
		expect(highlight('Golden', fuzzyMatch('old', 'golden')!.hits)).toEqual([
			{ text: 'G', hit: false },
			{ text: 'old', hit: true },
			{ text: 'en', hit: false }
		]);
	});
});

describe('searching the library', () => {
	it('returns everything for an empty query', () => {
		expect(names('  ')).toHaveLength(3);
	});
	it('finds titles, tags and chords, and needs every word to match', () => {
		expect(names('golden')).toEqual(['Golden Hour Run']);
		expect(names('jazz')).toEqual(['Blue Smoke Waltz']);
		expect(names('bVII')).toEqual(['Lemonade Weekend']);
		expect(names('pop mixo')).toEqual(['Lemonade Weekend']);
		expect(names('golden jazz')).toEqual([]);
	});
	it('forgives a typo in a title', () => {
		expect(names('waltz smkoe')).toEqual(['Blue Smoke Waltz']);
	});
});
