<script lang="ts" module>
	export type BlockAction =
		| { type: 'up' | 'down' | 'duplicate' | 'delete' | 'unique' | 'regenerate' }
		| { type: 'rename'; label: string }
		| { type: 'bars'; bars: number }
		| { type: 'level'; delta: 1 | -1 };
</script>

<script lang="ts">
	import Icon from './Icon.svelte';
	import ChordChip from './ChordChip.svelte';
	import LevelStepper from './LevelStepper.svelte';
	import { colorOf, LABEL_NAMES } from '$lib/engine/data';
	import { canAdjust, levelOf, renderSection, sharedCount } from '$lib/engine/song';
	import type { Section, Song } from '$lib/engine/types';

	let {
		song,
		section,
		index,
		total,
		showNumerals,
		selectedChord,
		dragging = false,
		onaction,
		onchord,
		ondragstart
	}: {
		song: Song;
		section: Section;
		index: number;
		total: number;
		showNumerals: boolean;
		selectedChord: { progressionId: string; index: number } | null;
		dragging?: boolean;
		onaction: (action: BlockAction) => void;
		onchord: (slotIndex: number, bar: number, el: HTMLButtonElement) => void;
		ondragstart: (e: PointerEvent) => void;
	} = $props();

	let open = $state(false);
	let renaming = $state(false);
	let labelDraft = $state('');

	const bars = $derived(renderSection(song, section));
	const shared = $derived(sharedCount(song, section.progressionId));
	const scope = $derived({ kind: 'progression' as const, id: section.progressionId });
	const headingId = $derived(`block-${section.id}`);
	const barOptions = $derived([...new Set([2, 4, 8, 12, 16, section.bars])].sort((a, b) => a - b));

	function startRename() {
		labelDraft = section.label;
		renaming = true;
	}
	function submitRename(e: SubmitEvent) {
		e.preventDefault();
		if (labelDraft.trim()) onaction({ type: 'rename', label: labelDraft });
		renaming = false;
	}
</script>

<li
	class="block rise"
	class:dragging
	style:--i={index}
	data-section-index={index}
	style:--tag="var(--c-{colorOf(section.label)})"
	aria-labelledby={headingId}
>
	<div class="head">
		<div class="handle" aria-hidden="true" onpointerdown={ondragstart} title="Drag to reorder">
			<Icon name="drag" />
		</div>
		<div class="title">
			<h3 class="label-tag" id={headingId}>
				{section.label}<span class="visually-hidden">, section {index + 1} of {total}</span>
			</h3>
			<span class="meta">
				{section.bars} bars{#if shared > 1}&nbsp;· shared ×{shared}{/if}{#if section.transpose}&nbsp;· key +{section.transpose}{/if}
			</span>
		</div>
		<button class="btn icon ghost" type="button" disabled={index === 0} onclick={() => onaction({ type: 'up' })} aria-label="Move {section.label} up">
			<Icon name="up" />
		</button>
		<button class="btn icon ghost" type="button" disabled={index === total - 1} onclick={() => onaction({ type: 'down' })} aria-label="Move {section.label} down">
			<Icon name="down" />
		</button>
		<button class="btn icon ghost more" type="button" aria-expanded={open} aria-controls="actions-{section.id}" onclick={() => (open = !open)} aria-label="{section.label} options">
			<Icon name="more" />
		</button>
	</div>

	<div class="bars">
		{#each bars as bar (bar.bar)}
			<div class="bar">
				{#each bar.chords as c (c.index)}
					<ChordChip
						chord={c.chord}
						bar={bar.bar}
						showNumeral={showNumerals}
						selected={selectedChord?.progressionId === section.progressionId && selectedChord.index === c.index}
						onselect={(el) => onchord(c.index, bar.bar, el)}
					/>
				{/each}
			</div>
		{/each}
	</div>

	{#if open}
		<div class="actions" id="actions-{section.id}">
			<LevelStepper
				label="{section.label} chords"
				level={levelOf(song, scope)}
				canDown={canAdjust(song, scope, -1)}
				canUp={canAdjust(song, scope, 1)}
				onchange={(delta) => onaction({ type: 'level', delta })}
			/>
			{#if shared > 1}
				<p class="muted note">Changes apply to all {shared} {section.label} sections. Use "Make unique" to edit just this one.</p>
			{/if}
			<div class="row">
				{#if renaming}
					<form class="rename" onsubmit={submitRename}>
						<label class="visually-hidden" for="rename-{section.id}">Section name</label>
						<input class="input" id="rename-{section.id}" list="label-names" bind:value={labelDraft} maxlength="40" />
						<datalist id="label-names">
							{#each LABEL_NAMES as name (name)}<option value={name}></option>{/each}
						</datalist>
						<button class="btn primary" type="submit">Save</button>
						<button class="btn" type="button" onclick={() => (renaming = false)}>Cancel</button>
					</form>
				{:else}
					<button class="btn" type="button" onclick={startRename}><Icon name="edit" />Rename</button>
				{/if}
				<label class="bars-select">
					<span class="visually-hidden">Bars in {section.label}</span>
					<select class="input" value={section.bars} onchange={(e) => onaction({ type: 'bars', bars: Number(e.currentTarget.value) })}>
						{#each barOptions as n (n)}<option value={n}>{n} bars</option>{/each}
					</select>
				</label>
			</div>
			<div class="row">
				<button class="btn" type="button" onclick={() => onaction({ type: 'duplicate' })}><Icon name="copy" />Duplicate</button>
				<button class="btn" type="button" onclick={() => onaction({ type: 'regenerate' })}><Icon name="refresh" />Regenerate</button>
				{#if shared > 1}
					<button class="btn" type="button" onclick={() => onaction({ type: 'unique' })}>Make unique</button>
				{/if}
				<button class="btn danger" type="button" onclick={() => onaction({ type: 'delete' })}><Icon name="trash" />Delete</button>
			</div>
		</div>
	{/if}
</li>

<style>
	.block {
		position: relative;
		list-style: none;
		/* A wash of the section's colour bleeding in from the left edge of the glass. */
		background:
			radial-gradient(120% 140% at 0% 0%, color-mix(in srgb, var(--tag) 16%, transparent), transparent 60%),
			var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		box-shadow:
			var(--shadow),
			inset 0 1px 0 var(--hi);
		backdrop-filter: var(--glass);
		-webkit-backdrop-filter: var(--glass);
		padding: 4px 8px 8px 12px;
		min-width: 0;
		container-type: inline-size;
		transition:
			transform 0.3s var(--ease),
			box-shadow 0.3s var(--ease),
			border-color 0.2s;
	}
	.block::before {
		content: '';
		position: absolute;
		left: 0;
		top: 14px;
		bottom: 14px;
		width: 4px;
		border-radius: 0 4px 4px 0;
		background: var(--tag);
		box-shadow: 0 0 12px var(--tag);
	}
	.block.dragging {
		z-index: 2;
		transform: scale(1.02) rotate(-0.6deg);
		box-shadow:
			0 24px 48px -16px var(--glow),
			inset 0 1px 0 var(--hi);
		border-color: var(--accent);
	}
	.head {
		display: flex;
		align-items: center;
		gap: 2px;
	}
	.handle {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 40px;
		height: var(--tap);
		color: var(--muted);
		cursor: grab;
		touch-action: none;
		flex: none;
	}
	.handle :global(svg) {
		width: 22px;
		height: 22px;
	}
	.title {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		column-gap: 10px;
	}
	h3 {
		font-family: var(--display);
		font-size: 1.25rem;
		font-weight: 600;
	}
	.meta {
		font-size: 0.875rem;
		color: var(--muted);
	}
	.bars {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 4px;
	}
	/* Two chords share a bar: a size down so both stay readable. */
	.bar:has(> :global(:nth-child(2))) {
		--chord-size: 1.0625rem;
	}
	@container (max-width: 520px) {
		.bars {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}
	.bar {
		display: flex;
		flex-wrap: wrap;
		gap: 2px;
		background: var(--field);
		border-radius: 10px;
		border: 1px solid var(--border);
		min-width: 0;
	}
	.actions {
		animation: rise 0.4s var(--ease) backwards;
		margin-top: 8px;
		padding-top: 8px;
		border-top: 1px solid var(--border);
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.row {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}
	.rename {
		display: flex;
		gap: 8px;
		flex: 1 1 100%;
	}
	.rename .input {
		flex: 1;
		min-width: 0;
	}
	.note {
		margin: 0;
		font-size: 0.875rem;
	}
</style>
