export type StyleId = 'pop' | 'ballad' | 'jazz' | 'blues' | 'gospel' | 'folk' | 'lofi';
export type MoodId = 'happy' | 'melancholic' | 'dreamy' | 'tense' | 'uplifting' | 'calm';
export type Complexity = 1 | 2 | 3 | 4 | 5;
export type Mode = 'major' | 'minor' | 'dorian' | 'lydian' | 'mixolydian';
export type TimeSignature = '4/4' | '3/4' | '6/8';
export type Tonality = 'major' | 'minor';

/** What a section does in the song; drives which progressions fit. */
export type Role = 'intro' | 'verse' | 'chorus' | 'bridge' | 'outro';

/** Chord quality family; each family has its own simplify/embellish ladder. */
export type Family = 'maj' | 'min' | 'dom' | 'dim';

export type FormId = 'ab' | 'abab' | 'aaba' | 'vc2' | 'vcvcbc' | 'blues12' | 'length';

export type SongSettings = {
	style: StyleId;
	mood: MoodId;
	complexity: Complexity;
	key: string;
	mode: Mode;
	timeSignature: TimeSignature;
	bpm: number;
	seed: number;
};

/** A substitute chord shown instead of the slot's own chord once the slot reaches `atLevel`. */
export type Substitution = { degree: string; family: Family; atLevel: number };

export type ChordSlot = {
	bar: number; // 0-based bar within the progression
	beat: number; // 1-based beat the chord starts on
	degree: string; // e.g. 'vi', 'bVII', 'V/V'
	baseQuality: Family; // as generated
	baseLevel: number; // 1-5, as generated
	level: number; // simplify/embellish offset from baseLevel, keeps the original recoverable
	sub?: Substitution;
};

export type Progression = { id: string; bars: number; chords: ChordSlot[] };

export type Section = {
	id: string;
	label: string;
	progressionId: string;
	bars: number;
	/** Semitones above the song key (for "key change up"). */
	transpose?: number;
};

export type Song = {
	id: string;
	schemaVersion: 1;
	title: string;
	createdAt: string;
	updatedAt: string;
	settings: SongSettings;
	progressions: Record<string, Progression>;
	sections: Section[];
};

export type SetupChoices = {
	style: StyleId;
	mood: MoodId;
	complexity: Complexity;
	form: FormId;
	length: number;
	key: string; // note name or 'random'
	timeSignature: TimeSignature;
	barsPerSection: 4 | 8 | 12 | 16;
	seed: number | null; // null = random
};
