<script lang="ts">
	import type { RenderedChord } from '$lib/engine/theory';
	let {
		chord,
		bar,
		showNumeral = false,
		selected = false,
		onselect
	}: {
		chord: RenderedChord;
		bar: number;
		showNumeral?: boolean;
		selected?: boolean;
		onselect: (el: HTMLButtonElement) => void;
	} = $props();
	let el: HTMLButtonElement;
</script>

<button
	bind:this={el}
	type="button"
	class="chip"
	class:selected
	aria-label="{chord.spoken}, bar {bar + 1}"
	aria-pressed={selected}
	onclick={() => onselect(el)}
>
	<span class="sym">{chord.symbol}</span>
	{#if showNumeral}<span class="num" aria-hidden="true">{chord.numeral}</span>{/if}
</button>

<style>
	.chip {
		flex: 1;
		min-width: 0;
		min-height: var(--tap);
		padding: 4px 6px;
		border: 1px solid transparent;
		border-radius: 9px;
		background: transparent;
		transition:
			background-color 0.2s,
			border-color 0.2s,
			box-shadow 0.3s var(--ease),
			transform 0.2s var(--ease);
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		touch-action: manipulation;
	}
	@media (hover: hover) {
		.chip:hover {
			background: var(--surface-2);
		}
	}
	.chip:active {
		transform: scale(0.94);
	}
	.chip.selected {
		border-color: var(--accent);
		background: var(--accent-soft);
		box-shadow: 0 0 0 3px var(--accent-soft), 0 6px 20px -8px var(--glow);
		animation: pop 0.35s var(--spring);
	}
	.sym {
		font-size: var(--chord-size);
		font-weight: 700;
		letter-spacing: -0.01em;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		max-width: 100%;
	}
	.num {
		font-size: 0.75rem;
		color: var(--muted);
		font-family: var(--mono);
	}
</style>
