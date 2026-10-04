<script lang="ts">
	import Icon from './Icon.svelte';
	let {
		label,
		level,
		canDown,
		canUp,
		onchange,
		compact = false
	}: {
		label: string;
		level: number;
		canDown: boolean;
		canUp: boolean;
		onchange: (delta: 1 | -1) => void;
		compact?: boolean;
	} = $props();
</script>

<div class="stepper" class:compact role="group" aria-label={label}>
	<button class="btn icon" type="button" disabled={!canDown} onclick={() => onchange(-1)} aria-label="Simplify {label}">
		<Icon name="minus" />
	</button>
	<span class="value">
		{#if !compact}<span class="what">{label}</span>{/if}
		<span>Level {level} of 5</span>
	</span>
	<button class="btn icon" type="button" disabled={!canUp} onclick={() => onchange(1)} aria-label="Embellish {label}">
		<Icon name="plus" />
	</button>
</div>

<style>
	.stepper {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.value {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		font-weight: 600;
		font-variant-numeric: tabular-nums;
		text-align: center;
		line-height: 1.2;
	}
	.compact .value {
		flex: none;
		min-width: 6.5em;
	}
	.what {
		font-size: 0.8125rem;
		font-weight: 500;
		color: var(--muted);
	}
</style>
