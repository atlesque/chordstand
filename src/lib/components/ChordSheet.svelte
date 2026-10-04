<script lang="ts">
	import { onMount } from 'svelte';
	import Icon from './Icon.svelte';
	import LevelStepper from './LevelStepper.svelte';
	import { alternativesFor, canAdjust, levelOf, replacementFamily } from '$lib/engine/song';
	import { renderChord } from '$lib/engine/theory';
	import type { Song } from '$lib/engine/types';

	let {
		song,
		tonic,
		progressionId,
		index,
		sectionLabel,
		bar,
		onlevel,
		onreplace,
		onclose
	}: {
		song: Song;
		tonic: string;
		progressionId: string;
		index: number;
		sectionLabel: string;
		bar: number;
		onlevel: (delta: 1 | -1) => void;
		onreplace: (degree: string) => void;
		onclose: () => void;
	} = $props();

	let panel = $state<HTMLElement>();
	const slot = $derived(song.progressions[progressionId]?.chords[index]);
	const chord = $derived(slot ? renderChord(slot, tonic) : null);
	const scope = $derived({ kind: 'chord' as const, progressionId, index });
	const alternatives = $derived(
		slot
			? alternativesFor(slot.degree, song).map((degree) => ({
					degree,
					chord: renderChord({ ...slot, degree, baseQuality: replacementFamily(degree), sub: undefined }, tonic)
				}))
			: []
	);

	onMount(() => {
		panel?.querySelector<HTMLElement>('button:not(:disabled)')?.focus();
	});

	function onkeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			e.stopPropagation();
			onclose();
		}
	}
</script>

{#if slot && chord}
	<div
		bind:this={panel}
		class="sheet"
		role="dialog"
		aria-modal="false"
		aria-labelledby="sheet-title"
		tabindex="-1"
		{onkeydown}
	>
		<div class="inner">
			<div class="top">
				<div>
					<h2 id="sheet-title"><span class="sym">{chord.symbol}</span><span class="visually-hidden">, {chord.spoken}</span></h2>
					<p class="muted">{sectionLabel}, bar {bar + 1} · {chord.numeral}</p>
				</div>
				<button class="btn icon ghost" type="button" onclick={onclose} aria-label="Close chord options">
					<Icon name="close" />
				</button>
			</div>
			<LevelStepper
				label="This chord"
				level={levelOf(song, scope)}
				canDown={canAdjust(song, scope, -1)}
				canUp={canAdjust(song, scope, 1)}
				onchange={onlevel}
			/>
			{#if alternatives.length}
				<h3 class="alt-title">Replace with</h3>
				<div class="alts">
					{#each alternatives as alt (alt.degree)}
						<button class="btn" type="button" onclick={() => onreplace(alt.degree)} aria-label="Replace with {alt.chord.spoken}">
							{alt.chord.symbol}<span class="muted deg" aria-hidden="true">{alt.degree}</span>
						</button>
					{/each}
				</div>
			{/if}
		</div>
	</div>
{/if}

<style>
	.sheet {
		position: fixed;
		left: 0;
		right: 0;
		bottom: 0;
		z-index: 40;
		background: color-mix(in srgb, var(--bg) 80%, transparent);
		border-top: 1px solid var(--border);
		border-radius: 24px 24px 0 0;
		box-shadow:
			0 -16px 48px -12px rgb(0 0 0 / 0.3),
			inset 0 1px 0 var(--hi);
		backdrop-filter: var(--glass);
		-webkit-backdrop-filter: var(--glass);
		padding: 12px 16px calc(16px + var(--safe-bottom));
		animation: sheet-in 0.45s var(--ease);
	}
	@keyframes sheet-in {
		from {
			transform: translateY(100%);
		}
	}
	.sheet::before {
		content: '';
		display: block;
		width: 40px;
		height: 4px;
		margin: -4px auto 8px;
		border-radius: 2px;
		background: var(--border);
	}
	.inner {
		max-width: 560px;
		margin: 0 auto;
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	.top {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
	}
	h2 .sym {
		font-size: 2.5rem;
		font-weight: 800;
		letter-spacing: -0.02em;
	}
	p {
		margin: 0;
	}
	.alt-title {
		font-size: 0.75rem;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--muted);
	}
	.alts {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}
	.alts .btn {
		font-size: 1.125rem;
	}
	.deg {
		font-size: 0.75rem;
		font-family: var(--mono);
		font-weight: 500;
	}
</style>
