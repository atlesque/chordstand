import { parseSong } from '$lib/storage/schema';
import type { Song } from '$lib/engine/types';

// The library as it travels to Atlesque Play: one entry per song id, stamped with when it last changed.
// A deleted song stays as an entry without a song (a tombstone), so the deletion reaches other devices.

export type Entry = { id: string; at: number; song?: Song };
export type Entries = Map<string, Entry>;

/** The save stored on Atlesque Play. `songs` is only there for the account hub's song count. */
export type RemoteSave = { v: 1; songs: number; z?: string; list?: Entry[] };

/** Tombstones older than this are dropped: every device has had months to see the deletion. */
export const TOMBSTONE_MS = 180 * 24 * 60 * 60 * 1000;

/** Newest change wins, per song. On a tie the remote copy wins, so every device settles on the same one. */
export function merge(local: Entries, remote: Entries, now = Date.now()): Entries {
	const out: Entries = new Map();
	for (const [id, entry] of [...local, ...remote]) {
		const seen = out.get(id);
		if (!seen || entry.at >= seen.at) out.set(id, entry);
	}
	for (const [id, entry] of out) if (!entry.song && now - entry.at > TOMBSTONE_MS) out.delete(id);
	return out;
}

/** Same ids, stamps and deletions: nothing to upload. */
export function sameEntries(a: Entries, b: Entries): boolean {
	if (a.size !== b.size) return false;
	for (const [id, entry] of a) {
		const other = b.get(id);
		if (!other || other.at !== entry.at || !other.song !== !entry.song) return false;
	}
	return true;
}

function toBase64(bytes: Uint8Array): string {
	let bin = '';
	for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
	return btoa(bin);
}

function fromBase64(text: string): Uint8Array {
	const bin = atob(text);
	const out = new Uint8Array(bin.length);
	for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
	return out;
}

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
	const out = new Blob([bytes as BlobPart]).stream().pipeThrough(stream);
	return new Uint8Array(await new Response(out).arrayBuffer());
}

/** Songs compress about tenfold, so the library goes up deflated where the browser can do it. */
export async function encodeSave(entries: Entries): Promise<RemoteSave> {
	const list = [...entries.values()];
	const songs = list.filter((e) => e.song).length;
	if (typeof CompressionStream !== 'undefined') {
		const json = new TextEncoder().encode(JSON.stringify(list));
		return { v: 1, songs, z: toBase64(await pipe(json, new CompressionStream('deflate-raw'))) };
	}
	return { v: 1, songs, list };
}

/** Reads a save back. Anything unreadable is skipped rather than trusted: songs are validated like local ones. */
export async function decodeSave(data: unknown): Promise<Entries> {
	const out: Entries = new Map();
	if (!data || typeof data !== 'object') return out;
	const save = data as Partial<RemoteSave>;
	let list: unknown = save.list;
	if (typeof save.z === 'string') {
		const bytes = await pipe(fromBase64(save.z), new DecompressionStream('deflate-raw'));
		list = JSON.parse(new TextDecoder().decode(bytes));
	}
	if (!Array.isArray(list)) return out;
	for (const item of list) {
		if (!item || typeof item.id !== 'string' || typeof item.at !== 'number') continue;
		if (item.song === undefined) {
			out.set(item.id, { id: item.id, at: item.at });
			continue;
		}
		const song = parseSong(item.song);
		if (song && song.id === item.id) out.set(item.id, { id: item.id, at: item.at, song });
	}
	return out;
}
