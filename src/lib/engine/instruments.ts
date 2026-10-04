import { transpose } from '@tonaljs/note';

// Where a chord's notes sit on the player's instrument. Pure functions, no UI.

/** Intervals of each quality the ladders produce, lowest first. */
const QUALITY_INTERVALS: Record<string, string[]> = {
	'': ['1P', '3M', '5P'],
	maj7: ['1P', '3M', '5P', '7M'],
	maj9: ['1P', '3M', '5P', '7M', '9M'],
	'6/9': ['1P', '3M', '5P', '6M', '9M'],
	maj13: ['1P', '3M', '5P', '7M', '9M', '13M'],
	m: ['1P', '3m', '5P'],
	m7: ['1P', '3m', '5P', '7m'],
	m9: ['1P', '3m', '5P', '7m', '9M'],
	m11: ['1P', '3m', '5P', '7m', '9M', '11P'],
	m13: ['1P', '3m', '5P', '7m', '9M', '13M'],
	'7': ['1P', '3M', '5P', '7m'],
	'9': ['1P', '3M', '5P', '7m', '9M'],
	'13': ['1P', '3M', '5P', '7m', '9M', '13M'],
	'7b9': ['1P', '3M', '5P', '7m', '9m'],
	dim: ['1P', '3m', '5d'],
	m7b5: ['1P', '3m', '5d', '7m'],
	m11b5: ['1P', '3m', '5d', '7m', '11P']
};

const SEMITONES: Record<string, number> = {
	'1P': 0, '3m': 3, '3M': 4, '5d': 6, '5P': 7, '6M': 9, '7m': 10, '7M': 11,
	'9m': 13, '9M': 14, '11P': 17, '13M': 21
}; // prettier-ignore

const LETTER: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

export function chromaOf(note: string): number {
	let c = LETTER[note.charAt(0)] ?? 0;
	for (const ch of note.slice(1)) c += ch === '#' ? 1 : ch === 'b' ? -1 : 0;
	return ((c % 12) + 12) % 12;
}

export type ChordTone = { interval: string; semitones: number; chroma: number; name: string };

export function chordTones(root: string, quality: string): ChordTone[] {
	const intervals = QUALITY_INTERVALS[quality] ?? QUALITY_INTERVALS[''];
	const r = chromaOf(root);
	return intervals.map((interval) => ({
		interval,
		semitones: SEMITONES[interval],
		chroma: (r + SEMITONES[interval]) % 12,
		name: transpose(root, interval) || root
	}));
}

/* ---------- Piano ---------- */

/** Keys to press, as semitones above the C at or below the root, within two octaves. */
export function pianoKeys(root: string, quality: string): number[] {
	const r = chromaOf(root);
	const keys = chordTones(root, quality).map((t) => {
		const k = r + t.semitones;
		return k >= 24 ? k - 12 : k;
	});
	return [...new Set(keys)].sort((a, b) => a - b);
}

/* ---------- Guitar ---------- */

/** Standard tuning, low E to high E, as MIDI notes. */
const GUITAR = [40, 45, 50, 55, 59, 64];

/** One fret per string, low E first; -1 is muted, 0 is open. */
export type GuitarShape = number[];

const guitarCache = new Map<string, GuitarShape>();

/** The 5th (and the 9th under an 11th or 13th) is the usual note to leave out. */
function optionalIntervals(intervals: string[]): Set<string> {
	const optional = new Set(['5P']);
	if (intervals.includes('11P') || intervals.includes('13M')) optional.add('9M');
	return optional;
}

/**
 * A playable shape with the root in the bass: at most four fingers (a barre counts as one) over
 * four frets, at least four strings sounding. Lower positions and open strings win.
 */
export function guitarShape(root: string, quality: string): GuitarShape {
	const key = `${root}|${quality}`;
	const cached = guitarCache.get(key);
	if (cached) return cached;

	const tones = chordTones(root, quality);
	const pcs = new Set(tones.map((t) => t.chroma));
	const rootPc = chromaOf(root);
	const optional = optionalIntervals(tones.map((t) => t.interval));
	let required = tones.filter((t) => !optional.has(t.interval)).map((t) => t.chroma);
	const extras = tones.filter((t) => optional.has(t.interval)).map((t) => t.chroma);

	let best: { shape: GuitarShape; score: number } | null = null;
	// Drop the highest required tone until something fits (only the most stacked chords need this).
	while (!best && required.length >= 2) {
		best = searchGuitar(pcs, rootPc, required, extras);
		if (!best) required = required.slice(0, -1);
	}
	const shape = best?.shape ?? [-1, -1, -1, -1, -1, -1];
	guitarCache.set(key, shape);
	return shape;
}

function searchGuitar(pcs: Set<number>, rootPc: number, required: number[], extras: number[]) {
	let best: { shape: GuitarShape; score: number } | null = null;
	const shape: number[] = [];

	for (let low = 1; low <= 12; low++) {
		const allowOpen = low <= 2;
		const options = GUITAR.map((open) => {
			const opts = [-1];
			if (allowOpen && pcs.has(open % 12)) opts.push(0);
			for (let f = low; f < low + 4; f++) if (pcs.has((open + f) % 12)) opts.push(f);
			return opts;
		});
		const walk = (s: number, mutes: number) => {
			if (s === GUITAR.length) {
				const score = scoreGuitar(shape, rootPc, required, extras);
				if (score !== null && (!best || score < best.score)) best = { shape: [...shape], score };
				return;
			}
			for (const f of options[s]) {
				if (f === -1 && mutes >= 2) continue;
				shape[s] = f;
				walk(s + 1, mutes + (f === -1 ? 1 : 0));
			}
		};
		walk(0, 0);
	}
	return best as { shape: GuitarShape; score: number } | null;
}

function scoreGuitar(shape: number[], rootPc: number, required: number[], extras: number[]): number | null {
	const played = shape.map((f, s) => (f < 0 ? null : (GUITAR[s] + f) % 12));
	const first = played.findIndex((p) => p !== null);
	if (first < 0 || played[first] !== rootPc) return null;
	const sounding = new Set(played.filter((p): p is number => p !== null));
	if (!required.every((pc) => sounding.has(pc))) return null;

	const fretted = shape.filter((f) => f > 0);
	const lowest = fretted.length ? Math.min(...fretted) : 0;
	// A barre across the lowest fret frees the other fingers, as long as no open string sits under it.
	const atLowest = shape.flatMap((f, s) => (f === lowest && lowest > 0 ? [s] : []));
	const barre =
		atLowest.length >= 2 && !shape.slice(atLowest[0], atLowest.at(-1)! + 1).some((f) => f === 0);
	const fingers = barre ? 1 + fretted.filter((f) => f > lowest).length : fretted.length;
	if (fingers > 4) return null;

	const silent = shape.filter((f) => f < 0).length;
	const mutedInside = shape.slice(first).filter((f) => f < 0).length;
	const opens = shape.filter((f) => f === 0).length;
	const missing = extras.filter((pc) => !sounding.has(pc)).length;
	const highest = fretted.length ? Math.max(...fretted) : 0;
	return highest * 1.5 + (highest - lowest) + fingers * 0.3 + silent * 1.2 + mutedInside * 6 + missing * 2 - opens * 0.5;
}

/** "x 3 2 0 1 0" style, low string first. */
export function guitarTab(shape: GuitarShape): string {
	return shape.map((f) => (f < 0 ? 'x' : String(f))).join(' ');
}

/* ---------- Violin ---------- */

/** G D A E, as MIDI notes. */
export const VIOLIN = [55, 62, 69, 76];
export const VIOLIN_STRINGS = ['G', 'D', 'A', 'E'];

/** Semitone steps above each open string reachable in first position (open to 4th finger). */
export const FIRST_POSITION = 7;

export type ViolinStop = { string: number; step: number; root: boolean };

/** Every chord tone in first position, for arpeggios and double stops. */
export function violinStops(root: string, quality: string): ViolinStop[] {
	const pcs = new Set(chordTones(root, quality).map((t) => t.chroma));
	const rootPc = chromaOf(root);
	const stops: ViolinStop[] = [];
	VIOLIN.forEach((open, string) => {
		for (let step = 0; step <= FIRST_POSITION; step++) {
			const pc = (open + step) % 12;
			if (pcs.has(pc)) stops.push({ string, step, root: pc === rootPc });
		}
	});
	return stops;
}
