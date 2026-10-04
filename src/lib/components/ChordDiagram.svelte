<script lang="ts">
	import { chordTones, FIRST_POSITION, guitarShape, pianoKeys, VIOLIN_STRINGS, violinStops } from '$lib/engine/instruments';
	import type { RenderedChord } from '$lib/engine/theory';
	import type { Instrument } from '$lib/engine/types';

	let { chord, instrument, size = 'md' }: { chord: RenderedChord; instrument: Instrument; size?: 'sm' | 'md' } = $props();

	const tones = $derived(chordTones(chord.root, chord.quality));
	const names = $derived(tones.map((t) => t.name).join(', '));

	/* ---------- Piano: two octaves from the C below the root ---------- */
	const WHITE = [0, 2, 4, 5, 7, 9, 11];
	const KW = 8;
	const keys = $derived(instrument === 'piano' ? new Set(pianoKeys(chord.root, chord.quality)) : new Set<number>());
	const whites = Array.from({ length: 14 }, (_, i) => ({ k: Math.floor(i / 7) * 12 + WHITE[i % 7], x: i * KW }));
	const blacks = Array.from({ length: 24 }, (_, k) => k)
		.filter((k) => !WHITE.includes(k % 12))
		.map((k) => ({ k, x: (Math.floor(k / 12) * 7 + WHITE.indexOf((k % 12) - 1) + 1) * KW - 2.6 }));

	/* ---------- Guitar: four frets, low E on the left ---------- */
	const shape = $derived(instrument === 'guitar' ? guitarShape(chord.root, chord.quality) : []);
	const rootChroma = $derived(tones[0]?.chroma);
	const GUITAR_OPEN = [4, 9, 2, 7, 11, 4];
	const fretted = $derived(shape.filter((f) => f > 0));
	const baseFret = $derived(fretted.length && Math.max(...fretted) > 4 ? Math.min(...fretted) : 1);
	const guitarLabel = $derived(
		`Guitar, low string to high: ${shape.map((f) => (f < 0 ? 'muted' : f === 0 ? 'open' : `fret ${f}`)).join(', ')}`
	);

	/* ---------- Violin: chord tones in first position ---------- */
	const stops = $derived(instrument === 'violin' ? violinStops(chord.root, chord.quality) : []);

	const label = $derived(
		instrument === 'guitar'
			? guitarLabel
			: instrument === 'violin'
				? `Violin, first position: ${names}`
				: `Piano keys: ${names}`
	);
</script>

{#if instrument === 'piano'}
	<svg class="dia piano {size}" viewBox="-1 -1 114 46" role="img" aria-label={label}>
		{#each whites as w (w.k)}
			<rect x={w.x} y="0" width={KW} height="44" rx="1.5" class="white" class:on={keys.has(w.k)} />
			{#if keys.has(w.k)}<circle cx={w.x + KW / 2} cy="37" r="2.2" class="dot-bg" />{/if}
		{/each}
		{#each blacks as b (b.k)}
			<rect x={b.x} y="0" width="5.2" height="27" rx="1" class="black" class:on={keys.has(b.k)} />
			{#if keys.has(b.k)}<circle cx={b.x + 2.6} cy="21" r="1.7" class="dot-bg" />{/if}
		{/each}
	</svg>
{:else if instrument === 'guitar'}
	<svg class="dia guitar {size}" viewBox="0 0 64 74" role="img" aria-label={label}>
		{#if baseFret > 1}<text x="5" y="22" class="fretno" text-anchor="middle">{baseFret}</text>{/if}
		{#each [0, 1, 2, 3, 4] as r (r)}
			<line x1="14" x2="59" y1={12 + r * 14} y2={12 + r * 14} class="fret" class:nut={r === 0 && baseFret === 1} />
		{/each}
		{#each shape as f, s (s)}
			{@const x = 14 + s * 9}
			<line x1={x} x2={x} y1="12" y2="68" class="string" />
			{#if f < 0}
				<path d="M{x - 2.4} 3.6l4.8 4.8m0-4.8-4.8 4.8" class="mute" />
			{:else if f === 0}
				<circle cx={x} cy="6" r="2.6" class="open" class:root={GUITAR_OPEN[s] === rootChroma} />
			{:else}
				<circle cx={x} cy={12 + (f - baseFret + 0.5) * 14} r="3.8" class="stop" class:root={(GUITAR_OPEN[s] + f) % 12 === rootChroma} />
			{/if}
		{/each}
	</svg>
{:else}
	<svg class="dia violin {size}" viewBox="0 0 48 86" role="img" aria-label={label}>
		{#each Array.from({ length: FIRST_POSITION + 1 }, (_, i) => i) as r (r)}
			<line x1="6" x2="42" y1={12 + r * 9} y2={12 + r * 9} class="fret" class:nut={r === 0} class:faint={r > 0} />
		{/each}
		{#each VIOLIN_STRINGS as name, i (name)}
			<line x1={9 + i * 10} x2={9 + i * 10} y1="12" y2="75" class="string" />
			<text x={9 + i * 10} y="84" class="fretno" text-anchor="middle">{name}</text>
		{/each}
		{#each stops as stop (`${stop.string}:${stop.step}`)}
			{#if stop.step === 0}
				<circle cx={9 + stop.string * 10} cy="6" r="2.6" class="open" class:root={stop.root} />
			{:else}
				<circle cx={9 + stop.string * 10} cy={12 + (stop.step - 0.5) * 9} r="3.4" class="stop" class:root={stop.root} />
			{/if}
		{/each}
	</svg>
{/if}

<style>
	.dia {
		display: block;
		height: auto;
		flex: none;
		color: inherit;
		overflow: visible;
	}
	.dia.md {
		width: 96px;
	}
	.dia.sm {
		width: 52px;
	}
	.piano.md {
		width: 168px;
	}
	.piano.sm {
		width: 88px;
	}
	/* A real keyboard in both themes: ivory and ebony, not inverted in dark mode. */
	.white {
		fill: #fbfaf7;
		stroke: #17141f;
		stroke-width: 0.8;
		stroke-opacity: 0.5;
	}
	.black {
		fill: #17141f;
	}
	.white.on,
	.black.on {
		fill: var(--accent);
	}
	.dot-bg {
		fill: var(--accent-text);
	}
	.fret,
	.string {
		stroke: currentColor;
		stroke-width: 0.8;
		stroke-opacity: 0.55;
	}
	.fret.nut {
		stroke-width: 3;
		stroke-opacity: 1;
	}
	.fret.faint {
		stroke-opacity: 0.2;
	}
	.stop {
		fill: currentColor;
	}
	.open {
		fill: none;
		stroke: currentColor;
		stroke-width: 1.2;
	}
	.stop.root {
		fill: var(--accent);
	}
	.open.root {
		stroke: var(--accent);
		stroke-width: 1.8;
	}
	.mute {
		stroke: currentColor;
		stroke-width: 1.2;
		stroke-linecap: round;
		opacity: 0.7;
	}
	.fretno {
		fill: currentColor;
		font-size: 8px;
		font-family: var(--mono);
		font-weight: 600;
	}
</style>
