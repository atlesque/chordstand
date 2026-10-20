import { describe, expect, it } from 'vitest';
import { DEFAULT_SETUP, generateSong } from '$lib/engine/generator';
import { MemoryStorage, SongRepo } from '$lib/storage/repo';
import { TOMBSTONE_MS, decodeSave, encodeSave, merge, sameEntries, type Entries, type Entry } from '$lib/sync/merge';

const song = (seed = 1) => generateSong({ ...DEFAULT_SETUP, seed });
const entries = (...list: Entry[]): Entries => new Map(list.map((e) => [e.id, e]));

describe('sync merge', () => {
	it('keeps songs from both sides and the newest copy of each', () => {
		const a = song(1);
		const b = song(2);
		const c = song(3);
		const older = { ...a, title: 'Old title' };
		const merged = merge(entries({ id: a.id, at: 200, song: a }, { id: b.id, at: 100, song: b }), entries({ id: a.id, at: 100, song: older }, { id: c.id, at: 50, song: c }));
		expect([...merged.keys()].sort()).toEqual([a.id, b.id, c.id].sort());
		expect(merged.get(a.id)?.song?.title).toBe(a.title);
	});
	it('lets a later deletion win, and a later edit undo an older deletion', () => {
		const a = song(1);
		expect(merge(entries({ id: a.id, at: 100, song: a }), entries({ id: a.id, at: 200 })).get(a.id)?.song).toBeUndefined();
		expect(merge(entries({ id: a.id, at: 300, song: a }), entries({ id: a.id, at: 200 })).get(a.id)?.song).toEqual(a);
	});
	it('forgets old tombstones', () => {
		const now = Date.now();
		const merged = merge(entries({ id: 'x', at: now - TOMBSTONE_MS - 1 }, { id: 'y', at: now - 1000 }), new Map(), now);
		expect([...merged.keys()]).toEqual(['y']);
	});
	it('compares stamps and deletions, not object identity', () => {
		const a = song(1);
		expect(sameEntries(entries({ id: a.id, at: 1, song: a }), entries({ id: a.id, at: 1, song: { ...a } }))).toBe(true);
		expect(sameEntries(entries({ id: a.id, at: 1, song: a }), entries({ id: a.id, at: 1 }))).toBe(false);
		expect(sameEntries(entries({ id: a.id, at: 1, song: a }), entries({ id: a.id, at: 2, song: a }))).toBe(false);
	});
	it('round-trips a compressed save and counts songs for the account hub', async () => {
		const a = song(1);
		const b = song(2);
		const save = await encodeSave(entries({ id: a.id, at: 5, song: a }, { id: b.id, at: 6 }));
		expect(save.songs).toBe(1);
		expect(typeof save.z).toBe('string');
		const back = await decodeSave(JSON.parse(JSON.stringify(save)));
		expect(back.get(a.id)).toEqual({ id: a.id, at: 5, song: a });
		expect(back.get(b.id)).toEqual({ id: b.id, at: 6 });
	});
	it('drops invalid songs from the server instead of trusting them', async () => {
		const a = song(1);
		const back = await decodeSave({ v: 1, songs: 2, list: [{ id: a.id, at: 1, song: { ...a, sections: 'nope' } }, { id: 'other', at: 1, song: a }, null] });
		expect(back.size).toBe(0);
		expect((await decodeSave(null)).size).toBe(0);
	});
	it('keeps a whole library well under the 1 MB limit', async () => {
		const list: Entry[] = [];
		for (let i = 0; i < 300; i++) {
			const s = { ...song(i), id: `song-${i}` };
			list.push({ id: s.id, at: i, song: s });
		}
		const save = await encodeSave(entries(...list));
		expect(JSON.stringify(save).length).toBeLessThan(1024 * 1024);
	});
});

describe('repo change hook', () => {
	it('reports saves and deletes, but not quiet ones', () => {
		const r = new SongRepo(new MemoryStorage());
		const seen: string[] = [];
		r.onchange = (id, deleted) => seen.push(`${deleted ? '-' : '+'}${id}`);
		const a = song(1);
		r.save(a);
		r.delete(a.id);
		r.save(a, true);
		r.delete(a.id, true);
		expect(seen).toEqual([`+${a.id}`, `-${a.id}`]);
	});
});
