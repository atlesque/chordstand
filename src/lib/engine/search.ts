// Small fuzzy search for the song library: forgiving enough for phone typing, cheap enough to
// run over ~10,000 songs on every keystroke. No dependencies, so it stays out of the main bundle.
import { partBars, type LibrarySong } from './library-check';
import type { StyleId } from './types';

export type Match = { score: number; hits: number[] };

const isWordStart = (text: string, i: number) => i === 0 || /[\s\-–(]/.test(text[i - 1]);

/** Damerau-Levenshtein distance, giving up early once it passes `max`. */
function editDistance(a: string, b: string, max: number): number {
	if (Math.abs(a.length - b.length) > max) return max + 1;
	let prev2: number[] = [];
	let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
	for (let i = 1; i <= a.length; i++) {
		const row = [i];
		let best = i;
		for (let j = 1; j <= b.length; j++) {
			const cost = a[i - 1] === b[j - 1] ? 0 : 1;
			let d = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + cost);
			if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d = Math.min(d, prev2[j - 2] + 1);
			row.push(d);
			best = Math.min(best, d);
		}
		if (best > max) return max + 1;
		prev2 = prev;
		prev = row;
	}
	return prev[b.length];
}

/**
 * How well `query` matches `text`, both already lower-cased, or null for no match.
 * Substrings beat scattered letters, word starts beat the middle of a word, and a word
 * one typo away (two for long words) still counts.
 */
export function fuzzyMatch(query: string, text: string): Match | null {
	if (!query) return { score: 0, hits: [] };
	const at = text.indexOf(query);
	if (at >= 0) {
		// Prefer a hit at a word start, even if an earlier mid-word hit exists.
		let start = at;
		for (let i = at; i >= 0; i = text.indexOf(query, i + 1)) {
			if (isWordStart(text, i)) {
				start = i;
				break;
			}
		}
		const score = 100 + (isWordStart(text, start) ? 30 : 0) + (start === 0 ? 10 : 0) - start * 0.2 + (query.length / text.length) * 10;
		return { score, hits: Array.from({ length: query.length }, (_, k) => start + k) };
	}

	// Scattered letters in order ("gldn hr" → "golden hour"), cheapest when the gaps are small.
	const hits: number[] = [];
	let qi = 0;
	for (let ti = 0; ti < text.length && qi < query.length; ti++) {
		if (text[ti] === query[qi]) {
			hits.push(ti);
			qi++;
		}
	}
	if (qi === query.length && query.length >= 2) {
		let gaps = 0;
		for (let k = 1; k < hits.length; k++) gaps += hits[k] - hits[k - 1] - 1;
		const starts = hits.filter((i) => isWordStart(text, i)).length;
		const score = 60 + starts * 6 - gaps * 1.5;
		if (score > 20) return { score, hits };
	}

	// One slip of the thumb: compare against each word.
	if (query.length >= 4) {
		const max = query.length >= 8 ? 2 : 1;
		const re = /[^\s\-–()]+/g;
		for (let m = re.exec(text); m; m = re.exec(text)) {
			// Compare with the word's start, so a half-typed word with a typo still finds it.
			const word = m[0].slice(0, query.length);
			const start = m.index;
			if (editDistance(query, word, max) <= max) {
				return { score: 40 - editDistance(query, word, max) * 10, hits: Array.from({ length: word.length }, (_, k) => start + k) };
			}
		}
	}
	return null;
}

/** A library song with everything search needs, worked out once. */
export type IndexedSong = {
	song: LibrarySong;
	style: StyleId;
	name: string;
	/** Lower-case words describing the song: style, mood, mode, complexity name and section names. */
	tags: string[];
	/** Every chord degree the song uses, case kept ("vi" is not "VI"). */
	chords: Set<string>;
};

export function indexSong(song: LibrarySong, style: StyleId, tags: string[]): IndexedSong {
	const chords = new Set<string>();
	for (const part of Object.values(song.parts)) for (const bar of partBars(part ?? '')) for (const c of bar.split(' ')) chords.add(c);
	return { song, style, name: song.name.toLowerCase(), tags: tags.map((t) => t.toLowerCase()), chords };
}

export type Result = { item: IndexedSong; score: number; hits: number[] };

/**
 * Every song matching all words of the query, best first. A word can match the title (fuzzy),
 * a tag such as "jazz", "dreamy" or "bridge" (by prefix), or a chord such as "bVII" (exactly).
 */
export function searchSongs(items: readonly IndexedSong[], query: string): Result[] {
	const words = query.trim().split(/\s+/).filter(Boolean);
	if (!words.length) return items.map((item) => ({ item, score: 0, hits: [] }));
	const lower = words.map((w) => w.toLowerCase());
	const whole = lower.join(' ');
	const results: Result[] = [];
	for (const item of items) {
		// The whole query as one phrase in the title is the strongest signal.
		const phrase = words.length > 1 ? fuzzyMatch(whole, item.name) : null;
		if (phrase && phrase.score >= 100) {
			results.push({ item, score: phrase.score * words.length, hits: phrase.hits });
			continue;
		}
		let score = 0;
		const hits = new Set<number>();
		let ok = true;
		for (let w = 0; w < words.length; w++) {
			const name = fuzzyMatch(lower[w], item.name);
			const tag = item.tags.some((t) => t.startsWith(lower[w])) ? 70 : 0;
			const chord = item.chords.has(words[w]) ? 65 : 0;
			const best = Math.max(name?.score ?? 0, tag, chord);
			if (!best) {
				ok = false;
				break;
			}
			score += best;
			if (name && name.score === best) for (const h of name.hits) hits.add(h);
		}
		if (ok) results.push({ item, score, hits: [...hits].sort((a, b) => a - b) });
	}
	return results.sort((a, b) => b.score - a.score);
}

/** Splits `text` into plain and highlighted runs for the given hit indices. */
export function highlight(text: string, hits: readonly number[]): { text: string; hit: boolean }[] {
	const set = new Set(hits);
	const runs: { text: string; hit: boolean }[] = [];
	for (let i = 0; i < text.length; i++) {
		const hit = set.has(i);
		const last = runs[runs.length - 1];
		if (last && last.hit === hit) last.text += text[i];
		else runs.push({ text: text[i], hit });
	}
	return runs;
}
