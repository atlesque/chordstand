import moodsJson from '$data/moods.json';
import formsJson from '$data/forms.json';
import labelsJson from '$data/labels.json';
import patternsJson from '$data/patterns.json';
import type { Family, FormId, Mode, MoodId, Role, StyleId, Tonality } from './types';

export type PoolEntry = {
	degrees: string[]; // one item per bar; "ii V" = two chords in one bar
	weight: number;
	tonality: Tonality;
	modes?: Mode[];
	roles: Role[];
	moods: (MoodId | '*')[];
	minComplexity: number;
};

export type StyleData = {
	id: StyleId;
	name: string;
	bpm: [number, number];
	minLevel?: number;
	maxLevel?: number;
	dominantMajors?: boolean;
	tonicLanding?: boolean;
	substitutions: { secondaryDominants?: boolean; tritone?: boolean; borrowedIv?: boolean };
	families?: Record<string, Family>;
	pool: PoolEntry[];
};

export type MoodData = {
	name: string;
	modes: Partial<Record<Mode, number>>;
	bpm: [number, number];
	levelBias: number;
};

export type FormData = { name: string; sections: string[]; bars?: number; pattern?: string };

export type PatternEntry = { degrees: string[]; weight: number; minComplexity: number };

// Style files are data, not code: drop a new JSON file into src/data/styles to add a style.
const styleModules = import.meta.glob<StyleData>('/src/data/styles/*.json', { eager: true, import: 'default' });

const STYLE_ORDER: StyleId[] = ['pop', 'ballad', 'jazz', 'blues', 'gospel', 'folk', 'lofi', 'jpop', 'jrock', 'shoegaze'];

export const STYLES: Record<StyleId, StyleData> = Object.fromEntries(
	Object.values(styleModules).map((s) => [s.id, s])
) as Record<StyleId, StyleData>;

export const STYLE_IDS: StyleId[] = [
	...STYLE_ORDER.filter((id) => id in STYLES),
	...(Object.keys(STYLES) as StyleId[]).filter((id) => !STYLE_ORDER.includes(id))
];

export const MOODS = moodsJson as Record<MoodId, MoodData>;
export const MOOD_IDS = Object.keys(MOODS) as MoodId[];

export const FORMS = formsJson as Record<FormId, FormData>;
export const FORM_IDS = Object.keys(FORMS) as FormId[];

export const LABELS = labelsJson as Record<string, { role: Role; color: string }>;
export const LABEL_NAMES = Object.keys(LABELS);

export const PATTERNS = patternsJson as Record<string, Record<Tonality, PatternEntry[]>>;

export function roleOf(label: string): Role {
	return LABELS[label]?.role ?? 'verse';
}

export function colorOf(label: string): string {
	return LABELS[label]?.color ?? 'other';
}

export { tonalityOf } from './names';

export const MODE_NAMES: Record<Mode, string> = {
	major: 'major',
	minor: 'minor',
	dorian: 'Dorian',
	lydian: 'Lydian',
	mixolydian: 'Mixolydian'
};

export const COMPLEXITY_NAMES = ['Simple', 'Easy', 'Medium', 'Rich', 'Advanced'] as const;

/** Keys that sit comfortably under the hands, per tonality. */
export const FRIENDLY_KEYS: Record<Tonality, string[]> = {
	major: ['C', 'G', 'D', 'F', 'Bb', 'Eb', 'A', 'E'],
	minor: ['A', 'E', 'D', 'B', 'G', 'C', 'F#']
};
