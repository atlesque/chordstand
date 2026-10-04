import { describe, expect, it } from 'vitest';
import { chordTones, chromaOf, guitarShape, guitarTab, pianoKeys, violinStops } from '$lib/engine/instruments';
import { LADDERS, NOTE_CHOICES } from '$lib/engine/theory';

const QUALITIES = [...new Set(Object.values(LADDERS).flat())];
const GUITAR = [40, 45, 50, 55, 59, 64];

describe('chord tones', () => {
	it('spells every ladder quality', () => {
		expect(chordTones('C', 'maj7').map((t) => t.name)).toEqual(['C', 'E', 'G', 'B']);
		expect(chordTones('Bb', 'm7b5').map((t) => t.name)).toEqual(['Bb', 'Db', 'Fb', 'Ab']);
		expect(chordTones('A', '6/9').map((t) => t.name)).toEqual(['A', 'C#', 'E', 'F#', 'B']);
		for (const q of QUALITIES) expect(chordTones('C', q).length).toBeGreaterThanOrEqual(3);
	});
	it('reads pitch classes from note names', () => {
		expect(chromaOf('C')).toBe(0);
		expect(chromaOf('Db')).toBe(1);
		expect(chromaOf('B#')).toBe(0);
		expect(chromaOf('Cb')).toBe(11);
	});
});

describe('piano', () => {
	it('stacks the chord up from the root within two octaves', () => {
		expect(pianoKeys('C', '')).toEqual([0, 4, 7]);
		expect(pianoKeys('A', 'm7')).toEqual([9, 12, 16, 19]);
		for (const root of NOTE_CHOICES) for (const q of QUALITIES) expect(Math.max(...pianoKeys(root, q))).toBeLessThan(24);
	});
});

describe('guitar', () => {
	it('finds the familiar open shapes', () => {
		expect(guitarTab(guitarShape('C', ''))).toBe('x 3 2 0 1 0');
		expect(guitarTab(guitarShape('A', 'm'))).toBe('x 0 2 2 1 0');
		expect(guitarTab(guitarShape('E', ''))).toBe('0 2 2 1 0 0');
		expect(guitarTab(guitarShape('D', ''))).toBe('x x 0 2 3 2');
		expect(guitarTab(guitarShape('G', '7'))).toBe('3 2 0 0 0 1');
		expect(guitarTab(guitarShape('F', ''))).toBe('1 3 3 2 1 1');
	});
	it('gives a playable shape with the root in the bass for every chord', () => {
		for (const root of [...NOTE_CHOICES, 'C#', 'Gb']) {
			for (const q of QUALITIES) {
				const shape = guitarShape(root, q);
				const tones = new Set(chordTones(root, q).map((t) => t.chroma));
				const notes = shape.flatMap((f, s) => (f < 0 ? [] : [(GUITAR[s] + f) % 12]));
				const name = `${root}${q} ${guitarTab(shape)}`;
				expect(notes.length, name).toBeGreaterThanOrEqual(4);
				expect(notes[0], name).toBe(chromaOf(root));
				expect(notes.every((n) => tones.has(n)), name).toBe(true);
				const fretted = shape.filter((f) => f > 0);
				if (fretted.length) expect(Math.max(...fretted) - Math.min(...fretted), name).toBeLessThanOrEqual(3);
			}
		}
	});
});

describe('violin', () => {
	it('marks chord tones in first position', () => {
		const stops = violinStops('G', '');
		// Open G, D and the root on the D string (G at 4th finger reaches 5 semitones up).
		expect(stops).toContainEqual({ string: 0, step: 0, root: true });
		expect(stops).toContainEqual({ string: 1, step: 0, root: false });
		expect(stops).toContainEqual({ string: 1, step: 5, root: true });
		expect(stops.every((s) => s.step <= 7)).toBe(true);
	});
});
