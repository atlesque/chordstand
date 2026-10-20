import { describe, expect, it } from 'vitest';
import { DEFAULT_SETUP, generateSong, pickLibrarySong } from '$lib/engine/generator';
import { checkSong, partBars, type LibraryFile, type LibrarySong } from '$lib/engine/library-check';
import { MOODS } from '$lib/engine/data';
import type { Mode, SetupChoices, Song } from '$lib/engine/types';

const song = (over: Partial<LibrarySong> = {}): LibrarySong => ({
	id: 'pop-test',
	name: 'Paper Lanterns',
	mood: 'happy',
	complexity: 2,
	mode: 'major',
	form: ['Intro', 'Verse', 'Chorus', 'Verse', 'Chorus', 'Outro'],
	parts: {
		intro: 'I|IV|I|V',
		verse: 'I|iii|vi|IV|I|iii|IV|V',
		chorus: 'IV|V|I|vi|IV|V|I IV|I',
		bridge: 'vi|IV|ii|V|vi|IV|bVII|V',
		outro: 'IV|V|I|I'
	},
	...over
});
const fixed = (over: Partial<SetupChoices> = {}): SetupChoices => ({ ...DEFAULT_SETUP, seed: 7, ...over });
const now = new Date('2026-01-01T00:00:00Z');
const degrees = (s: Song, pid: string) =>
	Array.from({ length: s.progressions[pid].bars }, (_, bar) =>
		s.progressions[pid].chords
			.filter((c) => c.bar === bar)
			.map((c) => c.degree)
			.join(' ')
	);

describe('library checks', () => {
	const modes = Object.keys(MOODS.happy.modes) as Mode[];
	it('accepts a well-formed song', () => {
		expect(checkSong(song(), modes)).toEqual([]);
	});
	it('rejects bad degrees, bar counts, modes and forms', () => {
		expect(checkSong(song({ parts: { ...song().parts, verse: 'I|V|vi|IV' } }), modes)[0]).toMatch(/4 bars/);
		expect(checkSong(song({ parts: { ...song().parts, intro: 'I|Cmaj7|I|V' } }), modes)[0]).toMatch(/invalid degree/);
		expect(checkSong(song({ mode: 'dorian' }), modes)[0]).toMatch(/does not fit/);
		expect(checkSong(song({ form: ['Verse', 'Solo', 'Chorus'] }), modes)[0]).toMatch(/unknown section/);
		expect(checkSong(song({ parts: { ...song().parts, bridge: 'vi|IV|V/V|V|vi|IV|bVII|V' } }), modes)[0]).toMatch(/below complexity 3/);
	});
	it('splits parts into bars', () => {
		expect(partBars('I| ii  V |vi')).toEqual(['I', 'ii V', 'vi']);
	});
});

describe('generating from the library', () => {
	const library = [song(), song({ id: 'pop-calm', mood: 'calm', name: 'Slow River' })];

	it('uses a fitting library song for the chords, mode and title', () => {
		const s = generateSong(fixed(), { library, id: 'x', now });
		expect(s.title).toBe('Paper Lanterns');
		expect(s.settings.mode).toBe('major');
		expect(degrees(s, 'verse')).toEqual(partBars(song().parts.verse!));
		expect(degrees(s, 'chorus')).toEqual(partBars(song().parts.chorus!));
	});
	it('is deterministic per seed', () => {
		expect(generateSong(fixed(), { library, id: 'x', now })).toEqual(generateSong(fixed(), { library, id: 'x', now }));
	});
	it('follows the library form when asked', () => {
		const s = generateSong(fixed({ form: 'library' }), { library, id: 'x', now });
		expect(s.sections.map((x) => x.label)).toEqual(song().form);
		expect(s.sections[0].bars).toBe(4);
	});
	it('fits parts to the chosen bar count', () => {
		const s = generateSong(fixed({ barsPerSection: 4 }), { library, id: 'x', now });
		expect(degrees(s, 'verse')).toEqual(['I iii', 'vi IV', 'I iii', 'IV V']);
	});
	it('falls back to the rule-based generator', () => {
		const plain = generateSong(fixed(), { id: 'x', now });
		expect(generateSong(fixed({ mood: 'tense' }), { library, id: 'x', now }).title).not.toBe('Paper Lanterns');
		expect(generateSong(fixed({ useLibrary: false }), { library, id: 'x', now })).toEqual(plain);
		expect(generateSong(fixed({ form: 'blues12' }), { library, id: 'x', now }).title).not.toBe('Paper Lanterns');
		expect(generateSong(fixed({ form: 'library' }), { id: 'x', now }).sections.map((x) => x.label)).toEqual(
			generateSong(fixed({ form: 'vcvcbc' }), { id: 'x', now }).sections.map((x) => x.label)
		);
	});
	it('only picks songs whose mode suits the mood', () => {
		expect(pickLibrarySong([song({ mode: 'dorian' })], fixed(), 1)).toBeNull();
	});
});

it('every shipped library file is valid', () => {
	const files = import.meta.glob<LibraryFile>('/src/data/library/*.json', { eager: true, import: 'default' });
	for (const [path, file] of Object.entries(files)) {
		expect(path.endsWith(`/${file.style}.json`), path).toBe(true);
		const ids = new Set<string>();
		for (const s of file.songs) {
			expect(checkSong(s, Object.keys(MOODS[s.mood].modes) as Mode[]), s.id).toEqual([]);
			expect(ids.has(s.id), s.id).toBe(false);
			ids.add(s.id);
		}
	}
});

describe('using a song picked in the library view', () => {
	it('builds the song from that entry, with its own form and title', async () => {
		const { setupFromLibrary } = await import('$lib/engine/generator');
		const entry = song({ id: 'pop-calm', mood: 'calm', complexity: 3, name: 'Slow River' });
		const choices = setupFromLibrary(entry, 'pop', { ...DEFAULT_SETUP, timeSignature: '3/4' });
		expect(choices).toMatchObject({ style: 'pop', mood: 'calm', complexity: 3, form: 'library', timeSignature: '3/4', seed: null });
		const s = generateSong({ ...choices, seed: 3 }, { entry, id: 'x', now });
		expect(s.title).toBe('Slow River');
		expect(s.sections.map((x) => x.label)).toEqual(entry.form);
		expect(degrees(s, 'verse')).toEqual(partBars(entry.parts.verse!));
	});
});
