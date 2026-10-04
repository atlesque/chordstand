import { parseSong } from './schema';
import type { Song } from '$lib/engine/types';

// The whole song travels in the URL hash, so sharing needs no server.
// Format: "z" + base64url(deflate-raw(json)) when CompressionStream exists, else "j" + base64url(json).

function toBase64Url(bytes: Uint8Array): string {
	let bin = '';
	for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
	return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text: string): Uint8Array {
	const b64 = text.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((text.length + 3) % 4);
	const bin = atob(b64);
	const out = new Uint8Array(bin.length);
	for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
	return out;
}

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
	const out = new Blob([bytes as BlobPart]).stream().pipeThrough(stream);
	return new Uint8Array(await new Response(out).arrayBuffer());
}

/** Drop fields the receiver doesn't need, to keep links short. */
function shareable(song: Song) {
	return { ...song, id: 'shared' };
}

export async function encodeSong(song: Song): Promise<string> {
	const json = new TextEncoder().encode(JSON.stringify(shareable(song)));
	if (typeof CompressionStream !== 'undefined') {
		try {
			return 'z' + toBase64Url(await pipe(json, new CompressionStream('deflate-raw')));
		} catch {
			/* fall back to plain */
		}
	}
	return 'j' + toBase64Url(json);
}

export async function decodeSong(encoded: string): Promise<Song | null> {
	try {
		const kind = encoded.charAt(0);
		let bytes = fromBase64Url(encoded.slice(1));
		if (kind === 'z') bytes = await pipe(bytes, new DecompressionStream('deflate-raw'));
		else if (kind !== 'j') return null;
		return parseSong(JSON.parse(new TextDecoder().decode(bytes)));
	} catch {
		return null;
	}
}
