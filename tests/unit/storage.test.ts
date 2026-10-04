import { describe, expect, it } from 'vitest';
import { DEFAULT_SETUP, generateSong } from '$lib/engine/generator';
import { MemoryStorage, SongRepo, songKey, INDEX_KEY } from '$lib/storage/repo';
import { migrate, parseSong } from '$lib/storage/schema';
import { buildExport, parseImport } from '$lib/storage/transfer';
import { decodeSong, encodeSong } from '$lib/storage/share';

const song = (seed = 1) => generateSong({ ...DEFAULT_SETUP, seed });

describe('schema', () => {
	it('accepts generated songs', () => {
		const s = song();
		expect(parseSong(JSON.parse(JSON.stringify(s)))).toEqual(s);
	});
	it('rejects invalid songs', () => {
		expect(parseSong({ ...song(), sections: 'nope' })).toBeNull();
		expect(parseSong(null)).toBeNull();
		const bad = song();
		bad.progressions.verse.chords[0].degree = 'XIV';
		expect(parseSong(bad)).toBeNull();
	});
	it('migrates unversioned songs', () => {
		const { schemaVersion: _v, ...legacy } = song();
		expect((migrate(legacy) as { schemaVersion: number }).schemaVersion).toBe(1);
		expect(parseSong(legacy)).not.toBeNull();
	});
});

describe('repo', () => {
	it('saves, lists newest first and deletes', () => {
		const repo = new SongRepo(new MemoryStorage());
		const a = { ...song(1), updatedAt: '2026-01-01T00:00:00Z' };
		const b = { ...song(2), updatedAt: '2026-02-01T00:00:00Z' };
		repo.save(a);
		repo.save(b);
		expect(repo.list().map((e) => e.id)).toEqual([b.id, a.id]);
		expect(repo.get(a.id)).toEqual(a);
		repo.delete(b.id);
		expect(repo.list().map((e) => e.id)).toEqual([a.id]);
	});

	it('skips a corrupt song instead of breaking the library', () => {
		const store = new MemoryStorage();
		const repo = new SongRepo(store);
		const a = song(1);
		repo.save(a);
		store.setItem(songKey('broken'), '{not json');
		store.setItem(INDEX_KEY, 'garbage');
		const list = new SongRepo(store).list();
		expect(list.map((e) => e.id)).toEqual([a.id]);
		expect(repo.get('broken')).toBeNull();
		expect(repo.invalidIds()).toContain('broken');
	});

	it('keeps working in memory when storage throws', () => {
		const store = new MemoryStorage();
		store.setItem = () => {
			throw new DOMException('full', 'QuotaExceededError');
		};
		const repo = new SongRepo(store);
		const a = song(3);
		const result = repo.save(a);
		expect(result.ok).toBe(false);
		expect(repo.get(a.id)).toEqual(a);
		expect(repo.status.message).toMatch(/full/i);
	});

	it('works with no storage at all', () => {
		const repo = new SongRepo(null);
		expect(repo.status.persistent).toBe(false);
		repo.save(song(4));
		expect(repo.list()).toHaveLength(1);
	});
});

describe('export / import / share', () => {
	it('round-trips an export file and counts bad entries', () => {
		const songs = [song(1), song(2)];
		const file = buildExport(songs);
		const text = JSON.stringify({ ...file, songs: [...file.songs, { junk: true }] });
		const result = parseImport(text);
		expect(result.songs).toEqual(songs);
		expect(result.skipped).toBe(1);
		expect(parseImport(JSON.stringify(songs[0])).songs).toHaveLength(1);
		expect(parseImport('nope').skipped).toBe(1);
	});

	it('encodes a song into a URL-safe string and back', async () => {
		const s = song(5);
		const encoded = await encodeSong(s);
		expect(encoded).toMatch(/^[zj][A-Za-z0-9_-]+$/);
		const decoded = await decodeSong(encoded);
		expect(decoded?.sections).toEqual(s.sections);
		expect(decoded?.progressions).toEqual(s.progressions);
		expect(await decodeSong('zgarbage')).toBeNull();
	});
});
