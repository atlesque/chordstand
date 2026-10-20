// Shape and checks for the pre-generated song library (src/data/library/<style>.json).
// No imports beyond degree parsing, so the offline batch script can run this file with plain Node.
import { parseDegree } from './degree.ts';
import type { Complexity, Mode, MoodId, Role, StyleId } from './types.ts';

/** One curated song structure. Chords are degrees, so the app still picks the key and chord colours. */
export type LibrarySong = {
	id: string;
	name: string;
	mood: MoodId;
	complexity: Complexity;
	mode: Mode;
	/** Section order, e.g. ["Intro", "Verse", "Chorus", "Verse", "Chorus", "Bridge", "Chorus", "Outro"]. */
	form: string[];
	/** One progression per role: bars separated by "|", two chords in a bar separated by a space. */
	parts: Partial<Record<Role, string>>;
};

export type LibraryFile = { version: 1; style: StyleId; songs: LibrarySong[] };

export const LIBRARY_LABELS: Record<string, Role> = {
	Intro: 'intro',
	Verse: 'verse',
	Chorus: 'chorus',
	Bridge: 'bridge',
	Outro: 'outro'
};

/** Bars per part as written in the library; the generator stretches or folds them to the chosen length. */
export const PART_BARS: Record<Role, number> = { intro: 4, verse: 8, chorus: 8, bridge: 8, outro: 4 };

export function partBars(part: string): string[] {
	return part.split('|').map((bar) => bar.trim().split(/\s+/).join(' '));
}

/** What makes two songs the same, for de-duplication. */
export function songSignature(song: Pick<LibrarySong, 'mode' | 'form' | 'parts'>): string {
	const roles = Object.keys(PART_BARS) as Role[];
	return [song.mode, song.form.join(','), ...roles.map((r) => song.parts[r] ?? '')].join('/');
}

/** Problems with one song, or an empty list. `modes` are the modes the song's mood allows. */
export function checkSong(song: LibrarySong, modes: readonly Mode[]): string[] {
	const problems: string[] = [];
	if (!song.name || song.name.length > 40) problems.push('name missing or longer than 40 characters');
	if (!modes.includes(song.mode)) problems.push(`mode ${song.mode} does not fit mood ${song.mood}`);
	if (song.form.length < 3 || song.form.length > 12) problems.push('form needs 3 to 12 sections');
	if (!song.form.includes('Verse')) problems.push('form has no Verse');
	for (const label of song.form) {
		const role = LIBRARY_LABELS[label];
		if (!role) problems.push(`unknown section ${label}`);
		else if (!song.parts[role]) problems.push(`no ${role} part for ${label}`);
	}
	const minor = song.mode === 'minor' || song.mode === 'dorian';
	for (const [role, part] of Object.entries(song.parts) as [Role, string][]) {
		const bars = partBars(part);
		if (bars.length !== PART_BARS[role]) problems.push(`${role} has ${bars.length} bars, expected ${PART_BARS[role]}`);
		for (const bar of bars) {
			const chords = bar.split(' ');
			if (chords.length > 2 || !chords[0]) problems.push(`${role} bar "${bar}" needs one or two chords`);
			if (song.complexity === 1 && chords.length > 1) problems.push(`${role} bar "${bar}" splits a bar at complexity 1`);
			for (const degree of chords) {
				const parsed = parseDegree(degree);
				if (!parsed) problems.push(`${role} has an invalid degree "${degree}"`);
				else if (parsed.target && song.complexity < 3) problems.push(`${role} uses ${degree} below complexity 3`);
			}
		}
		// The home chord must match the tonality, or every chord name comes out wrong.
		const first = bars[0]?.split(' ')[0];
		if (role === 'verse' && ((first === 'I' && minor) || (first === 'i' && !minor))) {
			problems.push(`verse starts on ${first} in ${song.mode}`);
		}
	}
	return problems;
}
