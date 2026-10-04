import { describe, expect, it } from 'vitest';
import { DEFAULT_SETUP, fitToBars, formLabels, generateSong, suggestNextLabel } from '$lib/engine/generator';
import { createRng, mulberry32 } from '$lib/engine/prng';
import { degreeRoot, renderChord, transposeTonic } from '$lib/engine/theory';
import { STYLE_IDS, MOOD_IDS } from '$lib/engine/data';
import {
	addSection,
	adjustLevel,
	deleteSection,
	duplicateSection,
	extendSong,
	levelOf,
	makeUnique,
	moveSection,
	renderSection,
	replaceChord
} from '$lib/engine/song';
import type { ChordSlot, SetupChoices, Song } from '$lib/engine/types';

const fixed = (over: Partial<SetupChoices> = {}): SetupChoices => ({ ...DEFAULT_SETUP, seed: 42, ...over });
const now = new Date('2026-01-01T00:00:00Z');
const symbols = (song: Song) =>
	song.sections.map((s) => renderSection(song, s).map((b) => b.chords.map((c) => c.chord.symbol).join(' ')));

describe('prng', () => {
	it('is deterministic per seed', () => {
		const a = mulberry32(7);
		const b = mulberry32(7);
		expect([a(), a(), a()]).toEqual([b(), b(), b()]);
		expect(mulberry32(8)()).not.toEqual(mulberry32(7)());
	});
	it('int stays in range', () => {
		const rng = createRng(1);
		for (let i = 0; i < 500; i++) {
			const n = rng.int(3, 5);
			expect(n).toBeGreaterThanOrEqual(3);
			expect(n).toBeLessThanOrEqual(5);
		}
	});
});

describe('theory', () => {
	it('spells degrees correctly in each key', () => {
		expect(degreeRoot('bVII', 'F')).toBe('Eb');
		expect(degreeRoot('bVI', 'F#')).toBe('D');
		expect(degreeRoot('V/V', 'Eb')).toBe('F');
		expect(degreeRoot('bII', 'B')).toBe('C');
		expect(degreeRoot('vi', 'G')).toBe('E');
		expect(degreeRoot('#iv°', 'C')).toBe('F#');
		expect(degreeRoot('bVI', 'Db')).toBe('A'); // Bbb is simplified
	});
	it('renders levels along the ladder', () => {
		const slot: ChordSlot = { bar: 0, beat: 1, degree: 'vi', baseQuality: 'min', baseLevel: 1, level: 0 };
		expect(renderChord(slot, 'C').symbol).toBe('Am');
		expect(renderChord({ ...slot, level: 1 }, 'C').symbol).toBe('Am7');
		expect(renderChord({ ...slot, level: 1 }, 'C').spoken).toBe('A minor seven');
		expect(renderChord({ ...slot, degree: 'bVII', baseQuality: 'maj' }, 'F').spoken).toBe('E flat major');
	});
	it('reveals substitutions only at their level', () => {
		const slot: ChordSlot = {
			bar: 0, beat: 1, degree: 'V', baseQuality: 'dom', baseLevel: 4, level: 0,
			sub: { degree: 'bII', family: 'dom', atLevel: 5 }
		};
		expect(renderChord(slot, 'C').symbol).toBe('G13');
		expect(renderChord({ ...slot, level: 1 }, 'C').symbol).toBe('Db7b9');
	});
	it('transposes keys with readable names', () => {
		expect(transposeTonic('G', 1)).toBe('Ab');
		expect(transposeTonic('C', 1)).toBe('Db');
		expect(transposeTonic('F', 1)).toBe('F#');
		expect(transposeTonic('B', 1)).toBe('C');
	});
});

describe('generator', () => {
	it('is deterministic: same inputs + seed = same song', () => {
		const a = generateSong(fixed(), { id: 'x', now });
		const b = generateSong(fixed(), { id: 'x', now });
		expect(b).toEqual(a);
		const c = generateSong(fixed({ seed: 43 }), { id: 'x', now });
		expect(symbols(c)).not.toEqual(symbols(a));
	});

	it('builds the default verse-chorus-bridge form with shared choruses', () => {
		const song = generateSong(fixed(), { now });
		expect(song.sections.map((s) => s.label)).toEqual(['Verse', 'Chorus', 'Verse', 'Chorus', 'Bridge', 'Chorus']);
		const chorusIds = new Set(song.sections.filter((s) => s.label === 'Chorus').map((s) => s.progressionId));
		expect(chorusIds.size).toBe(1);
		expect(Object.keys(song.progressions).sort()).toEqual(['bridge', 'chorus', 'verse']);
	});

	it('produces triads at complexity 1-2 and two chords per bar at 4-5', () => {
		const simple = generateSong(fixed({ complexity: 1 }), { now });
		for (const p of Object.values(simple.progressions)) {
			for (const c of p.chords) expect(c.baseLevel).toBe(1);
		}
		let maxPerBar = 0;
		for (let seed = 1; seed < 20; seed++) {
			const rich = generateSong(fixed({ complexity: 5, seed }), { now });
			for (const p of Object.values(rich.progressions)) {
				const counts = new Map<number, number>();
				p.chords.forEach((c) => counts.set(c.bar, (counts.get(c.bar) ?? 0) + 1));
				maxPerBar = Math.max(maxPerBar, ...counts.values());
			}
		}
		expect(maxPerBar).toBe(2);
	});

	it('works for every style, mood and complexity within 50 ms', () => {
		for (const style of STYLE_IDS) {
			for (const mood of MOOD_IDS) {
				for (const complexity of [1, 2, 3, 4, 5] as const) {
					const t = performance.now();
					const song = generateSong(fixed({ style, mood, complexity }), { now });
					expect(performance.now() - t).toBeLessThan(50);
					for (const section of song.sections) {
						const bars = renderSection(song, section);
						expect(bars).toHaveLength(section.bars);
						for (const bar of bars) {
							expect(bar.chords.length).toBeGreaterThan(0);
							for (const c of bar.chords) expect(c.chord.symbol).toMatch(/^[A-G](#|b)?/);
						}
					}
				}
			}
		}
	});

	it('supports the 12-bar blues template', () => {
		const song = generateSong(fixed({ style: 'blues', form: 'blues12', mood: 'happy' }), { now });
		expect(song.sections).toHaveLength(3);
		expect(song.sections.every((s) => s.bars === 12)).toBe(true);
	});

	it('builds custom-length forms', () => {
		expect(formLabels('length', 3)).toEqual(['Verse', 'Chorus', 'Verse']);
		const eight = formLabels('length', 8);
		expect(eight).toHaveLength(8);
		expect(eight[0]).toBe('Intro');
		expect(eight.at(-1)).toBe('Outro');
	});

	it('fits progressions to bar counts', () => {
		expect(fitToBars(['I', 'V', 'vi', 'IV'], 8, 'chorus', 'major')).toEqual(['I', 'V', 'vi', 'IV', 'I', 'V', 'vi', 'IV']);
		expect(fitToBars(['I', 'vi', 'IV', 'ii'], 8, 'verse', 'major').at(-1)).toBe('V');
		expect(fitToBars(['I', 'V', 'vi', 'IV'], 2, 'chorus', 'major')).toEqual(['I V', 'vi IV']);
	});

	it('suggests a bridge after the second chorus', () => {
		expect(suggestNextLabel(['Verse', 'Chorus', 'Verse', 'Chorus'])).toBe('Bridge');
		expect(suggestNextLabel(['Verse'])).toBe('Chorus');
		expect(suggestNextLabel(['A', 'A'])).toBe('B');
	});
});

describe('simplify and embellish', () => {
	it('round-trips: simplify then embellish returns the same chords', () => {
		const song = generateSong(fixed({ complexity: 3 }), { now });
		const before = symbols(song);
		const after = adjustLevel(adjustLevel(song, { kind: 'song' }, -1), { kind: 'song' }, 1);
		expect(symbols(after)).toEqual(before);
		const up = adjustLevel(adjustLevel(song, { kind: 'song' }, 1), { kind: 'song' }, -1);
		expect(symbols(up)).toEqual(before);
	});

	it('clamps at the ends without losing the original', () => {
		let song = generateSong(fixed({ complexity: 1 }), { now });
		const before = symbols(song);
		song = adjustLevel(song, { kind: 'song' }, -1);
		expect(symbols(song)).toEqual(before);
		for (let i = 0; i < 8; i++) song = adjustLevel(song, { kind: 'song' }, 1);
		expect(levelOf(song, { kind: 'song' })).toBe(5);
		for (let i = 0; i < 8; i++) song = adjustLevel(song, { kind: 'song' }, -1);
		expect(symbols(song)).toEqual(before);
	});

	it('embellishes one chord without touching others', () => {
		const song = generateSong(fixed({ complexity: 1 }), { now });
		const next = adjustLevel(song, { kind: 'chord', progressionId: 'verse', index: 0 }, 1);
		expect(next.progressions.verse.chords[0].level).toBe(1);
		expect(next.progressions.verse.chords[1].level).toBe(0);
		expect(next.progressions.chorus).toEqual(song.progressions.chorus);
	});
});

describe('block edits', () => {
	const base = () => generateSong(fixed(), { now });

	it('moves, duplicates and deletes sections', () => {
		const song = base();
		const moved = moveSection(song, 0, 2);
		expect(moved.sections.map((s) => s.label).slice(0, 3)).toEqual(['Chorus', 'Verse', 'Verse']);
		const dup = duplicateSection(song, 4);
		expect(dup.sections).toHaveLength(7);
		expect(dup.sections[5].label).toBe('Bridge');
		expect(dup.sections[5].id).not.toBe(dup.sections[4].id);
		const del = deleteSection(song, 4);
		expect(del.sections.map((s) => s.label)).not.toContain('Bridge');
		expect(del.progressions.bridge).toBeUndefined();
	});

	it('makes a shared section unique', () => {
		const song = base();
		const next = makeUnique(song, 1);
		expect(next.sections[1].progressionId).toBe('chorus-2');
		expect(next.sections[3].progressionId).toBe('chorus');
		const edited = adjustLevel(next, { kind: 'progression', id: 'chorus-2' }, 1);
		expect(edited.progressions.chorus).toEqual(song.progressions.chorus);
	});

	it('extends the song', () => {
		const song = base();
		expect(addSection(song, 'suggest').sections.at(-1)?.label).toBe('Outro');
		const keyUp = extendSong(song, 'key-change');
		expect(keyUp.sections.at(-1)?.transpose).toBe(1);
		const outro = extendSong(song, 'outro');
		expect(outro.sections.at(-1)?.label).toBe('Outro');
		expect(outro.progressions.outro).toBeDefined();
	});

	it('replaces a chord with an alternative', () => {
		const song = base();
		const next = replaceChord(song, 'verse', 0, 'vi');
		expect(next.progressions.verse.chords[0].degree).toBe('vi');
		expect(next.progressions.verse.chords[0].baseQuality).toBe('min');
	});
});
