import * as v from 'valibot';
import { isValidDegree } from '$lib/engine/degree';
import type { Song } from '$lib/engine/types';

const Family = v.picklist(['maj', 'min', 'dom', 'dim']);
const Degree = v.pipe(v.string(), v.check(isValidDegree, 'Unknown chord degree'));
const Level = v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(5));
const NoteName = v.pipe(v.string(), v.regex(/^[A-G](#|b)?$/));

const ChordSlot = v.object({
	bar: v.pipe(v.number(), v.integer(), v.minValue(0)),
	beat: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(12)),
	degree: Degree,
	baseQuality: Family,
	baseLevel: Level,
	level: v.pipe(v.number(), v.integer(), v.minValue(-10), v.maxValue(10)),
	sub: v.optional(v.object({ degree: Degree, family: Family, atLevel: Level }))
});

const Progression = v.object({
	id: v.string(),
	bars: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(64)),
	chords: v.array(ChordSlot)
});

const Section = v.object({
	id: v.string(),
	label: v.pipe(v.string(), v.minLength(1), v.maxLength(40)),
	progressionId: v.string(),
	bars: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(32)),
	transpose: v.optional(v.pipe(v.number(), v.integer(), v.minValue(-11), v.maxValue(11)))
});

export const SongSchema = v.pipe(
	v.object({
		id: v.pipe(v.string(), v.minLength(1), v.maxLength(64)),
		schemaVersion: v.literal(1),
		title: v.pipe(v.string(), v.maxLength(120)),
		createdAt: v.string(),
		updatedAt: v.string(),
		settings: v.object({
			style: v.string(),
			mood: v.string(),
			complexity: v.picklist([1, 2, 3, 4, 5]),
			key: NoteName,
			mode: v.picklist(['major', 'minor', 'dorian', 'lydian', 'mixolydian']),
			timeSignature: v.picklist(['4/4', '3/4', '6/8']),
			bpm: v.pipe(v.number(), v.minValue(20), v.maxValue(300)),
			seed: v.number()
		}),
		progressions: v.record(v.string(), Progression),
		sections: v.array(Section)
	}),
	v.check(
		(song) => song.sections.every((s) => s.progressionId in song.progressions),
		'Section points at a missing progression'
	)
);

export const CURRENT_SCHEMA_VERSION = 1;

/**
 * One migration per schema bump: MIGRATIONS[n] turns a version-n song into version n+1.
 * Add an entry here (and bump CURRENT_SCHEMA_VERSION) whenever the Song shape changes.
 */
export const MIGRATIONS: Record<number, (song: Record<string, unknown>) => Record<string, unknown>> = {
	0: (song) => ({ ...song, schemaVersion: 1 })
};

export function migrate(raw: unknown): unknown {
	if (!raw || typeof raw !== 'object') return raw;
	let song = raw as Record<string, unknown>;
	let version = typeof song.schemaVersion === 'number' ? song.schemaVersion : 0;
	while (version < CURRENT_SCHEMA_VERSION && MIGRATIONS[version]) {
		song = MIGRATIONS[version](song);
		version++;
	}
	return song;
}

/** Migrate and validate. Returns null for anything that isn't a valid song. */
export function parseSong(raw: unknown): Song | null {
	const result = v.safeParse(SongSchema, migrate(raw));
	return result.success ? (result.output as unknown as Song) : null;
}
