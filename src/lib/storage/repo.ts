import { parseSong } from './schema';
import type { Song } from '$lib/engine/types';

export const PREFIX = 'chordstand:v1:';
export const INDEX_KEY = `${PREFIX}index`;
export const songKey = (id: string) => `${PREFIX}song:${id}`;

/** Most browsers give an origin about 5 MB of localStorage. */
export const QUOTA_BYTES = 5 * 1024 * 1024;
export const WARN_RATIO = 0.8;

export type IndexEntry = { id: string; title: string; updatedAt: string };

export type KV = Pick<Storage, 'getItem' | 'setItem' | 'removeItem' | 'key'> & { readonly length: number };

export class MemoryStorage implements KV {
	#map = new Map<string, string>();
	get length() {
		return this.#map.size;
	}
	getItem(key: string) {
		return this.#map.get(key) ?? null;
	}
	setItem(key: string, value: string) {
		this.#map.set(key, String(value));
	}
	removeItem(key: string) {
		this.#map.delete(key);
	}
	key(i: number) {
		return [...this.#map.keys()][i] ?? null;
	}
}

export type RepoStatus = {
	/** False when the browser blocks storage: songs then only live until the tab closes. */
	persistent: boolean;
	message: string | null;
	usedBytes: number;
	nearQuota: boolean;
};

export type SaveResult = { ok: true } | { ok: false; error: string };

function probe(): KV | null {
	try {
		const ls = globalThis.localStorage;
		if (!ls) return null;
		const k = `${PREFIX}probe`;
		ls.setItem(k, '1');
		ls.removeItem(k);
		return ls;
	} catch {
		return null;
	}
}

/**
 * Songs are stored one key each, plus a small index, so one corrupt song never breaks the library.
 * Every read and write is guarded: when storage is unavailable or full, the app keeps working in memory.
 */
export class SongRepo {
	#store: KV;
	#memory = new MemoryStorage();
	#invalid = new Set<string>();
	status: RepoStatus;

	constructor(store: KV | null = probe()) {
		this.#store = store ?? this.#memory;
		this.status = {
			persistent: store !== null,
			message: store
				? null
				: 'Your browser is blocking storage (private mode?). Songs will be lost when you close this tab; export them to keep them.',
			usedBytes: 0,
			nearQuota: false
		};
		this.#refreshUsage();
	}

	#read(key: string): string | null {
		// Memory holds anything that failed to persist, so it is the newer copy.
		const pending = this.#memory.getItem(key);
		if (pending !== null) return pending;
		try {
			return this.#store.getItem(key);
		} catch {
			return null;
		}
	}

	#write(key: string, value: string): SaveResult {
		try {
			this.#store.setItem(key, value);
			if (this.#store !== this.#memory) this.#memory.removeItem(key);
			return { ok: true };
		} catch (err) {
			// Quota exceeded or storage revoked: fall back to memory so nothing is lost this session.
			this.#memory.setItem(key, value);
			if (this.#store !== this.#memory) {
				const full = err instanceof DOMException && /quota/i.test(err.name + err.message);
				this.status = {
					...this.status,
					message: full
						? 'Storage is full. Export your songs and delete some to free space; new changes are only kept until you close this tab.'
						: 'Saving failed. Changes are only kept until you close this tab; export your songs to keep them.'
				};
			}
			return { ok: false, error: this.status.message ?? 'Saving failed' };
		}
	}

	#remove(key: string) {
		try {
			this.#store.removeItem(key);
		} catch {
			/* ignore */
		}
		this.#memory.removeItem(key);
	}

	#refreshUsage() {
		let used = 0;
		try {
			for (let i = 0; i < this.#store.length; i++) {
				const k = this.#store.key(i);
				if (k?.startsWith(PREFIX)) used += (k.length + (this.#store.getItem(k)?.length ?? 0)) * 2;
			}
		} catch {
			/* ignore */
		}
		this.status = { ...this.status, usedBytes: used, nearQuota: used > QUOTA_BYTES * WARN_RATIO };
	}

	#readIndex(): IndexEntry[] {
		const raw = this.#read(INDEX_KEY);
		if (raw) {
			try {
				const parsed = JSON.parse(raw);
				if (Array.isArray(parsed)) {
					return parsed.filter(
						(e): e is IndexEntry =>
							e && typeof e.id === 'string' && typeof e.title === 'string' && typeof e.updatedAt === 'string'
					);
				}
			} catch {
				/* rebuild below */
			}
		}
		return this.#rebuildIndex();
	}

	#rebuildIndex(): IndexEntry[] {
		const entries: IndexEntry[] = [];
		const prefix = `${PREFIX}song:`;
		try {
			for (let i = 0; i < this.#store.length; i++) {
				const k = this.#store.key(i);
				if (!k?.startsWith(prefix)) continue;
				const song = this.get(k.slice(prefix.length));
				if (song) entries.push({ id: song.id, title: song.title, updatedAt: song.updatedAt });
			}
		} catch {
			/* ignore */
		}
		this.#write(INDEX_KEY, JSON.stringify(entries));
		return entries;
	}

	/** Library list, newest edit first. */
	list(): IndexEntry[] {
		return this.#readIndex().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
	}

	/** Ids of stored songs that failed validation (shown as "couldn't be opened" instead of crashing). */
	invalidIds(): string[] {
		return [...this.#invalid];
	}

	get(id: string): Song | null {
		const raw = this.#read(songKey(id));
		if (raw === null) return null;
		try {
			const song = parseSong(JSON.parse(raw));
			if (song) {
				this.#invalid.delete(id);
				return song;
			}
		} catch {
			/* fall through */
		}
		this.#invalid.add(id);
		return null;
	}

	save(song: Song): SaveResult {
		const result = this.#write(songKey(song.id), JSON.stringify(song));
		const index = this.#readIndex().filter((e) => e.id !== song.id);
		index.push({ id: song.id, title: song.title, updatedAt: song.updatedAt });
		this.#write(INDEX_KEY, JSON.stringify(index));
		this.#refreshUsage();
		return result;
	}

	delete(id: string) {
		this.#remove(songKey(id));
		this.#invalid.delete(id);
		this.#write(INDEX_KEY, JSON.stringify(this.#readIndex().filter((e) => e.id !== id)));
		this.#refreshUsage();
	}

	all(): Song[] {
		return this.list()
			.map((e) => this.get(e.id))
			.filter((s): s is Song => s !== null);
	}
}
