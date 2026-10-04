import { hashSeed, randomSeed } from './prng';
import { roleOf, tonalityOf } from './data';
import {
	contextOf,
	generateProgression,
	newId,
	progressionKey,
	suggestNextLabel
} from './generator';
import {
	MAX_LEVEL,
	MIN_LEVEL,
	effectiveLevel,
	familyOf,
	renderChord,
	transposeTonic,
	type RenderedChord
} from './theory';
import type { ChordSlot, Family, Progression, Section, Song } from './types';

/* ---------- Reading ---------- */

export type RenderedSlot = { slot: ChordSlot; index: number; chord: RenderedChord };
export type RenderedBar = { bar: number; chords: RenderedSlot[] };

export function sectionTonic(song: Song, section: Section): string {
	return transposeTonic(song.settings.key, section.transpose ?? 0);
}

/** The bars of a section, cycling its progression to fill the section's bar count. */
export function renderSection(song: Song, section: Section): RenderedBar[] {
	const prog = song.progressions[section.progressionId];
	if (!prog || prog.chords.length === 0) return [];
	const tonic = sectionTonic(song, section);
	const byBar = new Map<number, RenderedSlot[]>();
	prog.chords.forEach((slot, index) => {
		const list = byBar.get(slot.bar) ?? [];
		list.push({ slot, index, chord: renderChord(slot, tonic) });
		byBar.set(slot.bar, list);
	});
	const progBars = Math.max(prog.bars, ...prog.chords.map((c) => c.bar + 1));
	const out: RenderedBar[] = [];
	let carry: RenderedSlot[] = [];
	for (let i = 0; i < section.bars; i++) {
		const chords = byBar.get(i % progBars) ?? [];
		if (chords.length) carry = chords;
		// A bar with no chord of its own holds the previous chord.
		out.push({ bar: i, chords: chords.length ? chords : carry.slice(-1) });
	}
	return out;
}

export { songTonalityLabel } from './names';

export type LevelScope =
	| { kind: 'song' }
	| { kind: 'progression'; id: string }
	| { kind: 'chord'; progressionId: string; index: number };

function slotsIn(song: Song, scope: LevelScope): ChordSlot[] {
	if (scope.kind === 'song') return Object.values(song.progressions).flatMap((p) => p.chords);
	if (scope.kind === 'progression') return song.progressions[scope.id]?.chords ?? [];
	const slot = song.progressions[scope.progressionId]?.chords[scope.index];
	return slot ? [slot] : [];
}

/** Rounded average level of the chords in scope, for the "Level n of 5" display. */
export function levelOf(song: Song, scope: LevelScope): number {
	const slots = slotsIn(song, scope);
	if (!slots.length) return MIN_LEVEL;
	return Math.round(slots.reduce((sum, s) => sum + effectiveLevel(s), 0) / slots.length);
}

export function canAdjust(song: Song, scope: LevelScope, delta: 1 | -1): boolean {
	return slotsIn(song, scope).some((s) => {
		const lvl = effectiveLevel(s);
		return delta > 0 ? lvl < MAX_LEVEL : lvl > MIN_LEVEL;
	});
}

/* ---------- Editing (pure: each returns a new Song) ---------- */

function touch(song: Song): Song {
	return { ...song, updatedAt: new Date().toISOString() };
}

function clone<T>(value: T): T {
	return structuredClone(value);
}

/** Simplify (-1) or embellish (+1). Only moves slots that can move, so the step stays reversible. */
export function adjustLevel(song: Song, scope: LevelScope, delta: 1 | -1): Song {
	const next = clone(song);
	for (const slot of slotsIn(next, scope)) {
		const lvl = effectiveLevel(slot);
		if (delta > 0 ? lvl < MAX_LEVEL : lvl > MIN_LEVEL) slot.level += delta;
	}
	return touch(next);
}

export function moveSection(song: Song, from: number, to: number): Song {
	if (from === to || from < 0 || to < 0 || from >= song.sections.length || to >= song.sections.length) return song;
	const sections = [...song.sections];
	const [moved] = sections.splice(from, 1);
	sections.splice(to, 0, moved);
	return touch({ ...song, sections });
}

export function duplicateSection(song: Song, index: number): Song {
	const src = song.sections[index];
	if (!src) return song;
	const sections = [...song.sections];
	sections.splice(index + 1, 0, { ...src, id: newId() });
	return touch({ ...song, sections });
}

export function deleteSection(song: Song, index: number): Song {
	if (!song.sections[index]) return song;
	const sections = song.sections.filter((_, i) => i !== index);
	return touch(pruneProgressions({ ...song, sections }));
}

function pruneProgressions(song: Song): Song {
	const used = new Set(song.sections.map((s) => s.progressionId));
	const progressions = Object.fromEntries(Object.entries(song.progressions).filter(([id]) => used.has(id)));
	return { ...song, progressions };
}

export function renameSection(song: Song, index: number, label: string): Song {
	const trimmed = label.trim().slice(0, 40);
	if (!trimmed || !song.sections[index]) return song;
	const sections = song.sections.map((s, i) => (i === index ? { ...s, label: trimmed } : s));
	return touch({ ...song, sections });
}

export function setSectionBars(song: Song, index: number, bars: number): Song {
	const b = Math.max(1, Math.min(32, Math.round(bars)));
	if (!song.sections[index]) return song;
	const sections = song.sections.map((s, i) => (i === index ? { ...s, bars: b } : s));
	return touch({ ...song, sections });
}

function uniqueProgressionId(song: Song, base: string): string {
	if (!song.progressions[base]) return base;
	let n = 2;
	while (song.progressions[`${base}-${n}`]) n++;
	return `${base}-${n}`;
}

export function sharedCount(song: Song, progressionId: string): number {
	return song.sections.filter((s) => s.progressionId === progressionId).length;
}

/** Unlink a section from the progression it shares with same-label sections. */
export function makeUnique(song: Song, index: number): Song {
	const section = song.sections[index];
	if (!section || sharedCount(song, section.progressionId) < 2) return song;
	const next = clone(song);
	const id = uniqueProgressionId(next, section.progressionId);
	next.progressions[id] = { ...clone(next.progressions[section.progressionId]), id };
	next.sections[index] = { ...next.sections[index], progressionId: id };
	return touch(next);
}

export function regenerateSection(song: Song, index: number, seed = randomSeed()): Song {
	const section = song.sections[index];
	if (!section) return song;
	const old = song.progressions[section.progressionId];
	const prog = generateProgression(
		section.progressionId,
		section.label,
		old?.bars ?? section.bars,
		contextOf(song.settings),
		seed,
		old && old.bars === 12 && song.settings.style === 'blues' ? 'blues12' : undefined
	);
	return touch({ ...song, progressions: { ...song.progressions, [prog.id]: prog } });
}

export function addSection(song: Song, label: string | 'suggest', bars?: number): Song {
	const chosen = label === 'suggest' ? suggestNextLabel(song.sections.map((s) => s.label)) : label;
	const next = clone(song);
	const pid = progressionKey(chosen);
	const existing = next.sections.find((s) => s.progressionId === pid || s.label === chosen);
	const role = roleOf(chosen);
	const defaultBars =
		bars ?? existing?.bars ?? (role === 'intro' || role === 'outro' ? 4 : next.sections[0]?.bars ?? 8);
	let progressionId = existing?.progressionId;
	if (!progressionId || !next.progressions[progressionId]) {
		progressionId = uniqueProgressionId(next, pid);
		next.progressions[progressionId] = generateProgression(
			progressionId,
			chosen,
			defaultBars,
			contextOf(next.settings),
			randomSeed()
		);
	}
	next.sections.push({ id: newId(), label: chosen, progressionId, bars: defaultBars });
	return touch(next);
}

export type ExtendKind = 'outro' | 'final-chorus' | 'key-change';

export function extendSong(song: Song, kind: ExtendKind): Song {
	if (kind === 'outro') return addSection(song, 'Outro');
	const last = [...song.sections].reverse().find((s) => roleOf(s.label) === 'chorus') ?? song.sections.at(-1);
	if (!last) return addSection(song, 'suggest');
	const copy: Section = { ...last, id: newId() };
	if (kind === 'key-change') copy.transpose = (last.transpose ?? 0) + 1;
	return touch({ ...song, sections: [...song.sections, copy] });
}

export function setKey(song: Song, key: string): Song {
	return touch({ ...song, settings: { ...song.settings, key } });
}

export { duplicateSong, setTitle } from './meta';

export function setBpm(song: Song, bpm: number): Song {
	const b = Math.max(30, Math.min(240, Math.round(bpm)));
	return touch({ ...song, settings: { ...song.settings, bpm: b } });
}

/* ---------- Chord alternatives ---------- */

const MAJOR_ALTS: Record<string, string[]> = {
	I: ['vi', 'iii', 'IV'],
	ii: ['IV', 'vi', 'V/V'],
	iii: ['I', 'V', 'V/vi'],
	IV: ['ii', 'vi', 'iv'],
	V: ['iii', 'bVII', 'vii°'],
	vi: ['I', 'IV', 'iii'],
	'vii°': ['V', 'ii'],
	bVII: ['V', 'IV', 'bVI']
};
const MINOR_ALTS: Record<string, string[]> = {
	i: ['bIII', 'bVI', 'iv'],
	'ii°': ['iv', 'bVI'],
	bIII: ['i', 'bVI', 'v'],
	iv: ['ii°', 'bVI', 'IV'],
	v: ['V', 'bVII', 'bIII'],
	V: ['v', 'bVII', 'vii°'],
	bVI: ['iv', 'i', 'bIII'],
	bVII: ['V', 'v', 'bIII']
};

export function alternativesFor(degree: string, song: Song): string[] {
	const table = tonalityOf(song.settings.mode) === 'major' ? MAJOR_ALTS : MINOR_ALTS;
	const alts = table[degree] ?? (degree.includes('/') ? [degree.split('/')[1]] : []);
	return alts.filter((a) => a !== degree);
}

/** Family a chord gets when the player swaps it in: dominant for V and secondary dominants. */
export function replacementFamily(degree: string): Family {
	return degree.includes('/') || degree === 'V' ? 'dom' : familyOf(degree);
}

export function replaceChord(song: Song, progressionId: string, index: number, degree: string): Song {
	const next = clone(song);
	const slot = next.progressions[progressionId]?.chords[index];
	if (!slot) return song;
	const family = replacementFamily(degree);
	const { sub: _dropped, ...rest } = slot;
	next.progressions[progressionId].chords[index] = { ...rest, degree, baseQuality: family };
	return touch(next);
}

export function progressionFor(song: Song, section: Section): Progression | undefined {
	return song.progressions[section.progressionId];
}


/** Re-roll every progression with a new seed, keeping the section order the player arranged. */
export function regenerateAll(song: Song, seed = randomSeed()): Song {
	const ctx = contextOf({ ...song.settings, seed });
	const progressions: Record<string, Progression> = {};
	for (const [id, prog] of Object.entries(song.progressions)) {
		const section = song.sections.find((s) => s.progressionId === id);
		const pattern = prog.bars === 12 && song.settings.style === 'blues' ? 'blues12' : undefined;
		progressions[id] = generateProgression(id, section?.label ?? id, prog.bars, ctx, hashSeed(seed, id), pattern);
	}
	return touch({ ...song, settings: { ...song.settings, seed }, progressions });
}
