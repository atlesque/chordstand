import { DEFAULT_SETUP, newId } from './defaults';
import { createRng, hashSeed, randomSeed, type Rng } from './prng';
import {
	FORMS,
	FRIENDLY_KEYS,
	MOODS,
	PATTERNS,
	STYLES,
	roleOf,
	tonalityOf,
	type PoolEntry,
	type StyleData
} from './data';
import { clampLevel, familyOf, parseDegree } from './theory';
import type {
	ChordSlot,
	Complexity,
	Family,
	Mode,
	MoodId,
	Progression,
	Role,
	Section,
	SetupChoices,
	Song,
	SongSettings,
	StyleId,
	TimeSignature,
	Tonality
} from './types';

export { DEFAULT_SETUP, newId } from './defaults';

/** Base chord level for each complexity (index 0 = complexity 1). */
const BASE_LEVEL = [1, 1, 2, 3, 4];


export type ProgressionContext = {
	style: StyleId;
	mood: MoodId;
	mode: Mode;
	complexity: Complexity;
	timeSignature: TimeSignature;
};

export function contextOf(settings: SongSettings): ProgressionContext {
	return {
		style: settings.style,
		mood: settings.mood,
		mode: settings.mode,
		complexity: settings.complexity,
		timeSignature: settings.timeSignature
	};
}

function midBeat(ts: TimeSignature): number {
	return ts === '4/4' ? 3 : ts === '3/4' ? 3 : 4;
}

function pickEntry(style: StyleData, ctx: ProgressionContext, role: Role, rng: Rng): PoolEntry {
	const tonality = tonalityOf(ctx.mode);
	const base = style.pool.filter(
		(e) => e.tonality === tonality && (!e.modes || e.modes.includes(ctx.mode))
	);
	const byComplexity = base.filter((e) => e.minComplexity <= ctx.complexity);
	const byRole = byComplexity.filter((e) => e.roles.includes(role));
	// Outro and intro fall back to verse/chorus material when the style has none of their own.
	const fallbackRole: Role = role === 'outro' ? 'chorus' : role === 'intro' ? 'verse' : role;
	const candidates = [
		byRole,
		byComplexity.filter((e) => e.roles.includes(fallbackRole)),
		byComplexity,
		base
	].find((list) => list.length > 0);
	if (!candidates) {
		return {
			degrees: tonality === 'major' ? ['I', 'IV', 'V', 'I'] : ['i', 'iv', 'V', 'i'],
			weight: 1,
			tonality,
			roles: [role],
			moods: ['*'],
			minComplexity: 1
		};
	}
	return rng.weighted(candidates, (e) => {
		const moodFit = e.moods.includes('*') || e.moods.includes(ctx.mood) ? 1 : 0.25;
		// Mode-specific colour progressions get a boost when that mode was chosen.
		const modeFit = e.modes ? 2 : 1;
		return e.weight * moodFit * modeFit;
	});
}

/** Fit a per-bar degree list to the bar count (repeat, half-time or turnaround). */
export function fitToBars(degrees: string[], bars: number, role: Role, tonality: Tonality): string[] {
	const turnaround = 'V';
	const tonic = tonality === 'major' ? 'I' : 'i';
	const len = degrees.length;
	if (len === bars) return [...degrees];
	if (len > bars) {
		if (len === bars * 2) {
			const out: string[] = [];
			for (let i = 0; i < bars; i++) out.push(`${degrees[2 * i]} ${degrees[2 * i + 1]}`);
			return out;
		}
		const out = degrees.slice(0, bars);
		if (role !== 'chorus' && role !== 'outro') out[bars - 1] = turnaround;
		return out;
	}
	const out: string[] = [];
	for (let i = 0; i < bars; i++) out.push(degrees[i % len]);
	const last = out[bars - 1].split(' ').pop() ?? '';
	if (bars >= 8 && (role === 'verse' || role === 'bridge') && !/^V(\/|$)/.test(last)) {
		out[bars - 1] = turnaround;
	}
	if (role === 'outro' && bars >= 2) out[bars - 1] = tonic;
	return out;
}

function familyFor(degree: string, style: StyleData): Family {
	if (style.families?.[degree]) return style.families[degree];
	const p = parseDegree(degree);
	if (!p) return 'maj';
	if (p.target) return 'dom';
	if (p.numeral === 'V' && !p.minor && !p.accidental && !p.diminished) return 'dom';
	const fam = familyOf(degree);
	if (style.dominantMajors && fam === 'maj') return 'dom';
	return fam;
}

/** Secondary dominant that leads into `next`, if one makes sense. */
function approachTo(next: string): string | null {
	const p = parseDegree(next);
	if (!p || p.target || p.diminished) return null;
	if (p.numeral === 'I' && !p.accidental) return 'V';
	if (p.numeral === 'V' && !p.accidental) return 'V/V';
	return `V/${next}`;
}

function baseLevelFor(ctx: ProgressionContext, style: StyleData, rng: Rng): number {
	let level = BASE_LEVEL[ctx.complexity - 1] + (MOODS[ctx.mood]?.levelBias ?? 0);
	if (ctx.complexity >= 3 && rng.chance(ctx.complexity === 5 ? 0.35 : 0.25)) level += 1;
	if (style.minLevel) level = Math.max(level, Math.min(style.minLevel, BASE_LEVEL[ctx.complexity - 1] + 1));
	if (style.maxLevel) level = Math.min(level, style.maxLevel);
	return clampLevel(level);
}

function makeSlot(
	degree: string,
	bar: number,
	beat: number,
	ctx: ProgressionContext,
	style: StyleData,
	rng: Rng
): ChordSlot {
	const family = familyFor(degree, style);
	const slot: ChordSlot = {
		bar,
		beat,
		degree,
		baseQuality: family,
		baseLevel: baseLevelFor(ctx, style, rng),
		level: 0
	};
	if (ctx.complexity >= 3) {
		const p = parseDegree(degree);
		if (style.substitutions.tritone && family === 'dom' && p?.numeral === 'V' && !p.accidental && rng.chance(0.5)) {
			const sub = p.target ? `bII/${degree.split('/')[1]}` : 'bII';
			slot.sub = { degree: sub, family: 'dom', atLevel: 5 };
		} else if (
			style.substitutions.borrowedIv &&
			degree === 'IV' &&
			tonalityOf(ctx.mode) === 'major' &&
			rng.chance(0.5)
		) {
			slot.sub = { degree: 'iv', family: 'min', atLevel: 4 };
		}
	}
	return slot;
}

export function buildProgression(
	id: string,
	perBar: string[],
	ctx: ProgressionContext,
	rng: Rng
): Progression {
	const style = STYLES[ctx.style] ?? STYLES.pop;
	const mid = midBeat(ctx.timeSignature);
	const chords: ChordSlot[] = [];
	const twoPerBarChance = ctx.complexity === 5 ? 0.6 : ctx.complexity === 4 ? 0.45 : 0;
	perBar.forEach((bar, i) => {
		const parts = bar.trim().split(/\s+/);
		chords.push(makeSlot(parts[0], i, 1, ctx, style, rng));
		if (parts[1]) {
			chords.push(makeSlot(parts[1], i, mid, ctx, style, rng));
		} else if (twoPerBarChance && style.substitutions.secondaryDominants && rng.chance(twoPerBarChance)) {
			const next = perBar[(i + 1) % perBar.length].trim().split(/\s+/)[0];
			const approach = next !== parts[0] ? approachTo(next) : null;
			if (approach && approach !== parts[0]) chords.push(makeSlot(approach, i, mid, ctx, style, rng));
		}
	});
	return { id, bars: perBar.length, chords };
}

export function generateProgression(
	id: string,
	label: string,
	bars: number,
	ctx: ProgressionContext,
	seed: number,
	pattern?: string
): Progression {
	const rng = createRng(seed);
	const style = STYLES[ctx.style] ?? STYLES.pop;
	const role = roleOf(label);
	const tonality = tonalityOf(ctx.mode);
	let degrees: string[];
	const patternPool = pattern ? PATTERNS[pattern]?.[tonality] : undefined;
	if (patternPool?.length) {
		const options = patternPool.filter((p) => p.minComplexity <= ctx.complexity);
		degrees = rng.weighted(options.length ? options : patternPool, (p) => p.weight).degrees;
	} else {
		degrees = pickEntry(style, ctx, role, rng).degrees;
	}
	return buildProgression(id, fitToBars(degrees, bars, role, tonality), ctx, rng);
}

/** What usually comes next, e.g. a bridge after the second chorus. */
export function suggestNextLabel(labels: string[]): string {
	const last = labels[labels.length - 1];
	if (!last) return 'Verse';
	if (last === 'A' || last === 'B') {
		const tail = labels.slice(-2);
		if (last === 'B') return 'A';
		return tail.length === 2 && tail[0] === 'A' ? 'B' : 'A';
	}
	const choruses = labels.filter((l) => l === 'Chorus').length;
	switch (last) {
		case 'Intro':
			return 'Verse';
		case 'Verse':
			return 'Chorus';
		case 'Chorus':
			if (labels.includes('Bridge')) return 'Outro';
			return choruses >= 2 ? 'Bridge' : 'Verse';
		case 'Bridge':
			return 'Chorus';
		case 'Outro':
			return 'Chorus';
		default:
			return 'Verse';
	}
}

export function formLabels(form: SetupChoices['form'], length: number): string[] {
	if (form !== 'length') return [...(FORMS[form]?.sections ?? FORMS.vcvcbc.sections)];
	const n = Math.max(1, Math.min(16, Math.round(length)));
	const labels: string[] = [];
	const withIntro = n >= 6;
	const withOutro = n >= 5;
	if (withIntro) labels.push('Intro');
	while (labels.length < n - (withOutro ? 1 : 0)) labels.push(suggestNextLabel(labels.filter((l) => l !== 'Outro')));
	if (withOutro) labels.push('Outro');
	return labels.map((l, i) => (l === 'Outro' && i !== labels.length - 1 ? 'Chorus' : l));
}

export function progressionKey(label: string): string {
	return label.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'section';
}

function resolveSettings(choices: SetupChoices, rng: Rng, seed: number): SongSettings {
	const mood = MOODS[choices.mood] ?? MOODS.happy;
	const modes = Object.entries(mood.modes) as [Mode, number][];
	const mode = rng.weighted(modes, ([, w]) => w)[0];
	const tonality = tonalityOf(mode);
	const key = choices.key === 'random' ? rng.pick(FRIENDLY_KEYS[tonality]) : choices.key;
	const style = STYLES[choices.style] ?? STYLES.pop;
	const bpmMid = (style.bpm[0] + style.bpm[1] + mood.bpm[0] + mood.bpm[1]) / 4;
	const bpm = Math.round(bpmMid + rng.int(-6, 6));
	return {
		style: choices.style,
		mood: choices.mood,
		complexity: choices.complexity,
		key,
		mode,
		timeSignature: choices.timeSignature,
		bpm,
		seed
	};
}

function songTitle(settings: SongSettings): string {
	const style = STYLES[settings.style]?.name ?? settings.style;
	const mood = MOODS[settings.mood]?.name ?? settings.mood;
	return `${mood} ${style} in ${settings.key}${tonalityOf(settings.mode) === 'minor' ? 'm' : ''}`;
}

export function generateSong(choices: SetupChoices, opts: { id?: string; now?: Date } = {}): Song {
	const seed = choices.seed ?? randomSeed();
	const rng = createRng(seed);
	const settings = resolveSettings(choices, rng, seed);
	const form = FORMS[choices.form];
	const labels = formLabels(choices.form, choices.length);
	const bars = form?.bars ?? choices.barsPerSection;
	const ctx = contextOf(settings);
	const progressions: Record<string, Progression> = {};
	const sections: Section[] = labels.map((label, i) => {
		const pid = progressionKey(label);
		const role = roleOf(label);
		const sectionBars = (role === 'intro' || role === 'outro') && bars >= 8 && !form?.bars ? 4 : bars;
		if (!progressions[pid]) {
			progressions[pid] = generateProgression(pid, label, sectionBars, ctx, hashSeed(seed, pid), form?.pattern);
		}
		return { id: `s${i + 1}-${hashSeed(seed, `${pid}:${i}`).toString(36)}`, label, progressionId: pid, bars: sectionBars };
	});
	const now = (opts.now ?? new Date()).toISOString();
	return {
		id: opts.id ?? newId(),
		schemaVersion: 1,
		title: songTitle(settings),
		createdAt: now,
		updatedAt: now,
		settings,
		progressions,
		sections
	};
}

export function setupFromSettings(settings: SongSettings, form: SetupChoices['form'] = 'vcvcbc'): SetupChoices {
	return {
		...DEFAULT_SETUP,
		style: settings.style,
		mood: settings.mood,
		complexity: settings.complexity,
		timeSignature: settings.timeSignature,
		form
	};
}
