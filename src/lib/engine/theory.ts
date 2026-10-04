import { simplify, transpose } from '@tonaljs/note';
import { parseDegree, type ParsedDegree } from './degree';
import type { ChordSlot, Family } from './types';

export { isValidDegree, parseDegree, type ParsedDegree } from './degree';

export const MIN_LEVEL = 1;
export const MAX_LEVEL = 5;

/**
 * Chord quality per family and level: triad -> 7th -> 9th/add -> extensions -> altered.
 * Index 0 is level 1.
 */
export const LADDERS: Record<Family, readonly string[]> = {
	maj: ['', 'maj7', 'maj9', '6/9', 'maj13'],
	min: ['m', 'm7', 'm9', 'm11', 'm13'],
	dom: ['', '7', '9', '13', '7b9'],
	dim: ['dim', 'm7b5', 'm7b5', 'm11b5', 'm11b5']
};

const SPOKEN_QUALITY: Record<string, string> = {
	'': 'major',
	maj7: 'major seven',
	maj9: 'major nine',
	'6/9': 'six nine',
	maj13: 'major thirteen',
	m: 'minor',
	m7: 'minor seven',
	m9: 'minor nine',
	m11: 'minor eleven',
	m13: 'minor thirteen',
	'7': 'seven',
	'9': 'nine',
	'13': 'thirteen',
	'7b9': 'seven flat nine',
	dim: 'diminished',
	m7b5: 'half diminished',
	m11b5: 'minor eleven flat five'
};

const STEP_INTERVAL: Record<string, string> = {
	I: '1P',
	II: '2M',
	III: '3M',
	IV: '4P',
	V: '5P',
	VI: '6M',
	VII: '7M'
};
const FLAT_INTERVAL: Record<string, string> = {
	I: '1d',
	II: '2m',
	III: '3m',
	IV: '4d',
	V: '5d',
	VI: '6m',
	VII: '7m'
};
const SHARP_INTERVAL: Record<string, string> = {
	I: '1A',
	II: '2A',
	III: '3A',
	IV: '4A',
	V: '5A',
	VI: '6A',
	VII: '7A'
};

/** The natural family for a degree written in Roman numerals. */
export function familyOf(degree: string): Family {
	const p = parseDegree(degree);
	if (!p) return 'maj';
	if (p.target) return 'dom';
	if (p.diminished) return 'dim';
	if (p.minor) return 'min';
	return 'maj';
}

function cleanNote(note: string): string {
	if (!note) return note;
	return note.includes('##') || note.includes('bb') ? simplify(note) : note;
}

function intervalFor(p: ParsedDegree): string {
	const table = p.accidental === 'b' ? FLAT_INTERVAL : p.accidental === '#' ? SHARP_INTERVAL : STEP_INTERVAL;
	return table[p.numeral];
}

/** Root note name of a degree in a key (tonic note name such as 'G' or 'F#'). */
export function degreeRoot(degree: string, tonic: string): string {
	const p = parseDegree(degree);
	if (!p) return tonic;
	if (p.target) {
		const targetRoot = cleanNote(transpose(tonic, intervalFor(p.target)));
		const ownInterval = intervalFor({ ...p, target: undefined });
		return cleanNote(transpose(targetRoot, ownInterval));
	}
	return cleanNote(transpose(tonic, intervalFor(p)));
}

/** Transpose a tonic up by a number of semitones, keeping readable spelling. */
export function transposeTonic(tonic: string, semitones: number): string {
	const s = ((semitones % 12) + 12) % 12;
	if (s === 0) return tonic;
	const intervals = ['1P', '2m', '2M', '3m', '3M', '4P', '4A', '5P', '6m', '6M', '7m', '7M'];
	const out = cleanNote(transpose(tonic, intervals[s]));
	// Prefer common key names (Db over C#, F# over Gb, Ab over G#...).
	const preferred: Record<string, string> = { 'C#': 'Db', 'D#': 'Eb', 'G#': 'Ab', 'A#': 'Bb', Gb: 'F#', Cb: 'B', 'E#': 'F', 'B#': 'C', Fb: 'E' };
	return preferred[out] ?? out;
}

export function clampLevel(level: number): number {
	return Math.min(MAX_LEVEL, Math.max(MIN_LEVEL, Math.round(level)));
}

export function effectiveLevel(slot: Pick<ChordSlot, 'baseLevel' | 'level'>): number {
	return clampLevel(slot.baseLevel + slot.level);
}

/** The degree and family actually shown for a slot at its current level. */
export function activeChord(slot: ChordSlot): { degree: string; family: Family } {
	if (slot.sub && effectiveLevel(slot) >= slot.sub.atLevel) {
		return { degree: slot.sub.degree, family: slot.sub.family };
	}
	return { degree: slot.degree, family: slot.baseQuality };
}

export type RenderedChord = {
	symbol: string; // e.g. 'Am7'
	root: string;
	quality: string;
	spoken: string; // e.g. 'A minor seven'
	numeral: string; // e.g. 'vi7'
};

export function renderChord(slot: ChordSlot, tonic: string): RenderedChord {
	const { degree, family } = activeChord(slot);
	const level = effectiveLevel(slot);
	const quality = LADDERS[family][level - 1];
	const root = degreeRoot(degree, tonic);
	return {
		symbol: root + quality,
		root,
		quality,
		spoken: `${spokenNote(root)} ${SPOKEN_QUALITY[quality] ?? quality}`,
		numeral: numeralLabel(degree, family, quality)
	};
}

export function spokenNote(note: string): string {
	const letter = note.charAt(0);
	const rest = note.slice(1);
	if (rest === '#') return `${letter} sharp`;
	if (rest === 'b') return `${letter} flat`;
	if (rest === '##') return `${letter} double sharp`;
	if (rest === 'bb') return `${letter} double flat`;
	return letter;
}

/** Roman-numeral label with a light quality hint, for the optional "numerals" display. */
function numeralLabel(degree: string, family: Family, quality: string): string {
	const base = degree.replace('°', '');
	const hint = family === 'dim' ? (quality === 'dim' ? '°' : 'ø') : quality.replace(/^m(?!aj)/, '').replace('maj', 'Δ');
	return base + hint;
}

export const NOTE_CHOICES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'] as const;
