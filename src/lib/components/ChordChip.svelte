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
		border-radius: 8px;
		background: transparent;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		touch-action: manipulation;
	}
	.chip:hover {
		background: var(--surface-2);
	}
	.chip.selected {
		border-color: var(--accent);
		background: var(--accent-soft);
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
