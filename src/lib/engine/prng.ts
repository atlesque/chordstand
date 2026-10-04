/** A small seeded PRNG so the same inputs and seed always give the same song. */
export type Rng = {
	next(): number; // [0, 1)
	int(min: number, max: number): number; // inclusive
	pick<T>(items: readonly T[]): T;
	weighted<T>(items: readonly T[], weight: (item: T) => number): T;
	chance(p: number): boolean;
};

export function mulberry32(seed: number): () => number {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

export function createRng(seed: number): Rng {
	const next = mulberry32(seed);
	return {
		next,
		int: (min, max) => min + Math.floor(next() * (max - min + 1)),
		pick: (items) => items[Math.floor(next() * items.length)],
		weighted(items, weight) {
			const total = items.reduce((sum, item) => sum + Math.max(0, weight(item)), 0);
			if (total <= 0) return items[Math.floor(next() * items.length)];
			let r = next() * total;
			for (const item of items) {
				r -= Math.max(0, weight(item));
				if (r < 0) return item;
			}
			return items[items.length - 1];
		},
		chance: (p) => next() < p
	};
}

/** Derive a stable sub-seed, e.g. one per section label, from a song seed. */
export function hashSeed(seed: number, salt: string): number {
	let h = (seed ^ 0x9e3779b9) >>> 0;
	for (let i = 0; i < salt.length; i++) {
		h = Math.imul(h ^ salt.charCodeAt(i), 0x01000193) >>> 0;
	}
	return h >>> 0;
}

export function randomSeed(): number {
	return Math.floor(Math.random() * 0x7fffffff);
}
