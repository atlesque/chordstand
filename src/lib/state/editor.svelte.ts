import type { Song } from '$lib/engine/types';
import { repo } from './app.svelte';

const MAX_HISTORY = 100;
const AUTOSAVE_MS = 500;

/**
 * Holds the song being edited, with undo/redo and debounced autosave.
 * Every edit is a pure function Song -> Song, so history is just a list of snapshots.
 */
export class EditorState {
	song = $state<Song>() as Song;
	#past: Song[] = $state([]);
	#future: Song[] = $state([]);
	#timer: ReturnType<typeof setTimeout> | undefined;
	#transientStart: Song | null = null;
	saveError = $state<string | null>(null);

	constructor(song: Song) {
		this.song = song;
	}

	get canUndo() {
		return this.#past.length > 0;
	}
	get canRedo() {
		return this.#future.length > 0;
	}

	apply(edit: (song: Song) => Song) {
		const current = $state.snapshot(this.song) as Song;
		const next = edit(current);
		if (next === current) return;
		this.#past = [...this.#past, current].slice(-MAX_HISTORY);
		this.#future = [];
		this.song = next;
		this.#scheduleSave();
	}

	/** Start an edit made of many small steps (a drag); only the end result enters history. */
	beginTransient() {
		this.#transientStart = $state.snapshot(this.song) as Song;
	}
	transient(edit: (song: Song) => Song) {
		this.song = edit($state.snapshot(this.song) as Song);
	}
	commitTransient() {
		const start = this.#transientStart;
		this.#transientStart = null;
		if (!start) return;
		if (JSON.stringify(start.sections) === JSON.stringify(this.song.sections)) return;
		this.#past = [...this.#past, start].slice(-MAX_HISTORY);
		this.#future = [];
		this.#scheduleSave();
	}

	undo() {
		const prev = this.#past.at(-1);
		if (!prev) return false;
		this.#future = [$state.snapshot(this.song) as Song, ...this.#future];
		this.#past = this.#past.slice(0, -1);
		this.song = { ...prev, updatedAt: new Date().toISOString() };
		this.#scheduleSave();
		return true;
	}

	redo() {
		const next = this.#future[0];
		if (!next) return false;
		this.#past = [...this.#past, $state.snapshot(this.song) as Song];
		this.#future = this.#future.slice(1);
		this.song = { ...next, updatedAt: new Date().toISOString() };
		this.#scheduleSave();
		return true;
	}

	#scheduleSave() {
		clearTimeout(this.#timer);
		this.#timer = setTimeout(() => this.flush(), AUTOSAVE_MS);
	}

	flush() {
		clearTimeout(this.#timer);
		this.#timer = undefined;
		const result = repo().save($state.snapshot(this.song) as Song);
		this.saveError = result.ok ? null : result.error;
	}

	destroy() {
		if (this.#timer) this.flush();
	}
}
