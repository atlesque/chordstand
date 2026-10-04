<script lang="ts">
	import { onDestroy, tick } from 'svelte';
	import Icon from './Icon.svelte';
	import BlockCard, { type BlockAction } from './BlockCard.svelte';
	import ChordSheet from './ChordSheet.svelte';
	import LevelStepper from './LevelStepper.svelte';
	import ThemeToggle from './ThemeToggle.svelte';
	import { EditorState } from '$lib/state/editor.svelte';
	import { announce, INSTRUMENT_NAMES, prefs, savePrefs, showToast } from '$lib/state/app.svelte';
	import {
		addSection,
		adjustLevel,
		canAdjust,
		deleteSection,
		duplicateSection,
		extendSong,
		levelOf,
		makeUnique,
		moveSection,
		regenerateAll,
		regenerateSection,
		renameSection,
		replaceChord,
		sectionTonic,
		setBpm,
		setKey,
		setSectionBars,
		setTitle,
		type ExtendKind
	} from '$lib/engine/song';
	import { LABEL_NAMES, MODE_NAMES, MOODS, STYLES } from '$lib/engine/data';
	import { NOTE_CHOICES } from '$lib/engine/theory';
	import { encodeSong } from '$lib/storage/share';
	import { buildExport, downloadJson, exportFileName } from '$lib/storage/transfer';
	import type { Song } from '$lib/engine/types';

	let { song: initialSong }: { song: Song } = $props();

	// svelte-ignore state_referenced_locally
	const editor = new EditorState(initialSong);
	const song = $derived(editor.song);

	type Selected = { progressionId: string; index: number; sectionId: string; bar: number; returnTo: HTMLElement };
	let selected = $state<Selected | null>(null);
	let dragIndex = $state<number | null>(null);
	let titleDraft = $state('');
	let addChoice = $state('suggest');

	const selectedSection = $derived(selected ? song.sections.find((s) => s.id === selected!.sectionId) : undefined);

	onDestroy(() => editor.destroy());

	$effect(() => {
		titleDraft = song.title;
	});

	function focusBlock(index: number, selector = '.more') {
		tick().then(() => {
			const blocks = document.querySelectorAll<HTMLElement>('[data-section-index]');
			const target = blocks[Math.min(index, blocks.length - 1)]?.querySelector<HTMLElement>(selector);
			(target ?? document.getElementById('add-section'))?.focus();
		});
	}

	function onBlockAction(index: number, action: BlockAction) {
		const section = song.sections[index];
		if (!section) return;
		switch (action.type) {
			case 'up':
			case 'down': {
				const to = action.type === 'up' ? index - 1 : index + 1;
				editor.apply((s) => moveSection(s, index, to));
				announce(`${section.label} moved to position ${to + 1} of ${song.sections.length}`);
				// Keep focus on the same button of the moved block so repeated presses keep moving it.
				focusBlock(to, `[aria-label="Move ${section.label} ${action.type}"]`);
				break;
			}
			case 'duplicate':
				editor.apply((s) => duplicateSection(s, index));
				announce(`${section.label} duplicated`);
				break;
			case 'delete':
				editor.apply((s) => deleteSection(s, index));
				announce(`${section.label} deleted`);
				showToast(`${section.label} deleted`, { label: 'Undo', run: () => editor.undo() });
				focusBlock(index);
				break;
			case 'unique':
				editor.apply((s) => makeUnique(s, index));
				announce(`${section.label} now has its own chords`);
				break;
			case 'regenerate':
				editor.apply((s) => regenerateSection(s, index));
				announce(`New chords for ${section.label}`);
				break;
			case 'rename':
				editor.apply((s) => renameSection(s, index, action.label));
				break;
			case 'bars':
				editor.apply((s) => setSectionBars(s, index, action.bars));
				break;
			case 'level':
				editor.apply((s) => adjustLevel(s, { kind: 'progression', id: section.progressionId }, action.delta));
				break;
		}
	}

	function openChord(sectionIndex: number, slotIndex: number, bar: number, el: HTMLElement) {
		const section = song.sections[sectionIndex];
		selected = { progressionId: section.progressionId, index: slotIndex, sectionId: section.id, bar, returnTo: el };
	}

	function closeChord() {
		const el = selected?.returnTo;
		selected = null;
		if (el?.isConnected) el.focus();
	}

	/* ---------- Drag to reorder (pointer + touch); buttons are the accessible alternative ---------- */

	function startDrag(index: number, e: PointerEvent) {
		if (e.button !== 0) return;
		e.preventDefault();
		const pointerId = e.pointerId;
		editor.beginTransient();
		dragIndex = index;
		const label = song.sections[index].label;

		// Listen on window: the card's DOM node moves while dragging, which would drop pointer capture.
		const move = (ev: PointerEvent) => {
			if (dragIndex === null || ev.pointerId !== pointerId) return;
			ev.preventDefault();
			const edge = 72;
			if (ev.clientY < edge) window.scrollBy(0, -12);
			else if (ev.clientY > window.innerHeight - edge) window.scrollBy(0, 12);
			const over = document.elementFromPoint(ev.clientX, ev.clientY)?.closest<HTMLElement>('[data-section-index]');
			if (!over) return;
			const to = Number(over.dataset.sectionIndex);
			if (to === dragIndex) return;
			// Only swap once the pointer is well inside the target, so cards don't flicker back and forth.
			const r = over.getBoundingClientRect();
			const insideY = ev.clientY > r.top + r.height * 0.25 && ev.clientY < r.bottom - r.height * 0.25;
			if (!insideY) return;
			const from = dragIndex;
			editor.transient((s) => moveSection(s, from, to));
			dragIndex = to;
		};
		const end = (ev: PointerEvent) => {
			if (ev.pointerId !== pointerId) return;
			window.removeEventListener('pointermove', move);
			window.removeEventListener('pointerup', end);
			window.removeEventListener('pointercancel', end);
			const finalIndex = dragIndex;
			dragIndex = null;
			editor.commitTransient();
			if (finalIndex !== null && finalIndex !== index) {
				announce(`${label} moved to position ${finalIndex + 1} of ${song.sections.length}`);
			}
		};
		window.addEventListener('pointermove', move, { passive: false });
		window.addEventListener('pointerup', end);
		window.addEventListener('pointercancel', end);
	}

	/* ---------- Song-level actions ---------- */

	function saveTitle() {
		if (titleDraft.trim() && titleDraft !== song.title) editor.apply((s) => setTitle(s, titleDraft));
		else titleDraft = song.title;
	}

	function add() {
		editor.apply((s) => addSection(s, addChoice));
		const added = editor.song.sections.at(-1);
		announce(`${added?.label ?? 'Section'} added at the end`);
	}

	function extend(kind: ExtendKind) {
		editor.apply((s) => extendSong(s, kind));
		const added = editor.song.sections.at(-1);
		const what = kind === 'key-change' ? `${added?.label} up a semitone` : added?.label;
		announce(`${what} added at the end`);
	}

	async function share() {
		const url = `${location.origin}/s#${await encodeSong($state.snapshot(song) as Song)}`;
		try {
			if (navigator.share) {
				await navigator.share({ title: song.title, url });
				return;
			}
			await navigator.clipboard.writeText(url);
			showToast('Share link copied');
		} catch (err) {
			if ((err as DOMException)?.name !== 'AbortError') showToast("Couldn't share. Try Export instead.");
		}
	}

	function enterPlay() {
		editor.flush();
		// Must happen inside the tap, so the browser allows it.
		document.documentElement.requestFullscreen?.().catch(() => {});
	}

	function onkeydown(e: KeyboardEvent) {
		if (e.key === 'Escape' && selected) {
			closeChord();
			return;
		}
		const target = e.target as HTMLElement;
		if (target.closest('input, textarea, select')) return;
		const mod = e.metaKey || e.ctrlKey;
		if (mod && e.key.toLowerCase() === 'z') {
			e.preventDefault();
			if (e.shiftKey ? editor.redo() : editor.undo()) announce(e.shiftKey ? 'Redone' : 'Undone');
		} else if (mod && e.key.toLowerCase() === 'y') {
			e.preventDefault();
			if (editor.redo()) announce('Redone');
		}
	}
</script>

<svelte:window {onkeydown} onpagehide={() => editor.flush()} />
<svelte:head><title>{song.title} · Chordstand</title></svelte:head>

<div class="page" class:sheet-open={selected}>
	<header class="topbar">
		<a class="btn icon ghost" href="/" aria-label="Back to your songs"><Icon name="library" /></a>
		<div class="grow">
			<label for="song-title" class="visually-hidden">Song title</label>
			<input
				id="song-title"
				class="title-input"
				bind:value={titleDraft}
				maxlength="80"
				onblur={saveTitle}
				onkeydown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
			/>
		</div>
		<button class="btn icon ghost" type="button" disabled={!editor.canUndo} onclick={() => editor.undo() && announce('Undone')} aria-label="Undo">
			<Icon name="undo" />
		</button>
		<button class="btn icon ghost" type="button" disabled={!editor.canRedo} onclick={() => editor.redo() && announce('Redone')} aria-label="Redo">
			<Icon name="redo" />
		</button>
		<ThemeToggle />
	</header>

	<main id="main">
		{#if editor.saveError}
			<p class="notice warn" role="alert">{editor.saveError}</p>
		{/if}

		<section class="song-bar card rise" aria-label="Song settings">
			<p class="facts">
				<span>{STYLES[song.settings.style]?.name ?? song.settings.style}</span>
				<span aria-hidden="true">·</span>
				<span>{MOODS[song.settings.mood]?.name ?? song.settings.mood}</span>
				<span aria-hidden="true">·</span>
				<span>{song.settings.timeSignature}</span>
			</p>
			<div class="settings-row">
				<label class="inline-field">
					<span>Key</span>
					<select class="input" value={song.settings.key} onchange={(e) => editor.apply((s) => setKey(s, e.currentTarget.value))}>
						{#each NOTE_CHOICES as note (note)}<option value={note}>{note}</option>{/each}
						{#if !NOTE_CHOICES.includes(song.settings.key as (typeof NOTE_CHOICES)[number])}
							<option value={song.settings.key}>{song.settings.key}</option>
						{/if}
					</select>
					<span class="muted">{MODE_NAMES[song.settings.mode]}</span>
				</label>
				<label class="inline-field">
					<span>BPM</span>
					<input
						class="input bpm"
						type="number"
						inputmode="numeric"
						min="30"
						max="240"
						value={song.settings.bpm}
						onchange={(e) => editor.apply((s) => setBpm(s, Number(e.currentTarget.value) || s.settings.bpm))}
					/>
				</label>
				<label class="check">
					<input type="checkbox" bind:checked={prefs.showNumerals} onchange={savePrefs} />
					<span>Roman numerals</span>
				</label>
				<div class="inline-field shapes">
					<label class="check">
						<input type="checkbox" bind:checked={prefs.showShapes} onchange={savePrefs} />
						<span>Show chords on</span>
					</label>
					<select class="input" aria-label="Instrument" bind:value={prefs.instrument} onchange={savePrefs}>
						{#each Object.entries(INSTRUMENT_NAMES) as [id, name] (id)}<option value={id}>{name}</option>{/each}
					</select>
				</div>
			</div>
			<LevelStepper
				label="Whole song"
				level={levelOf(song, { kind: 'song' })}
				canDown={canAdjust(song, { kind: 'song' }, -1)}
				canUp={canAdjust(song, { kind: 'song' }, 1)}
				onchange={(delta) => {
					editor.apply((s) => adjustLevel(s, { kind: 'song' }, delta));
					announce(delta > 0 ? 'Whole song embellished' : 'Whole song simplified');
				}}
			/>
			<button
				class="btn block"
				type="button"
				onclick={() => {
					editor.apply((s) => regenerateAll(s));
					announce('New chords for the whole song');
				}}><Icon name="refresh" />Regenerate song</button
			>
		</section>

		<h2 class="visually-hidden">Sections</h2>
		{#if song.sections.length === 0}
			<p class="muted empty">No sections yet. Add one below.</p>
		{/if}
		<ol class="blocks">
			{#each song.sections as section, i (section.id)}
				<BlockCard
					{song}
					{section}
					index={i}
					total={song.sections.length}
					showNumerals={prefs.showNumerals}
					selectedChord={selected}
					dragging={dragIndex === i}
					onaction={(a) => onBlockAction(i, a)}
					onchord={(slot, bar, el) => openChord(i, slot, bar, el)}
					ondragstart={(e) => startDrag(i, e)}
				/>
			{/each}
		</ol>

		<section class="extend card rise" aria-labelledby="extend-title">
			<h2 id="extend-title" class="small-title display">Extend</h2>
			<div class="row">
				<label class="visually-hidden" for="add-section">Section to add</label>
				<select id="add-section" class="input grow" bind:value={addChoice}>
					<option value="suggest">Suggest what fits next</option>
					{#each LABEL_NAMES as name (name)}<option value={name}>{name}</option>{/each}
				</select>
				<button class="btn" type="button" onclick={add}><Icon name="plus" />Add section</button>
			</div>
			<div class="row">
				<button class="btn" type="button" onclick={() => extend('outro')}>Add outro</button>
				<button class="btn" type="button" onclick={() => extend('final-chorus')}>Repeat chorus</button>
				<button class="btn" type="button" onclick={() => extend('key-change')}>Key change up</button>
			</div>
		</section>
	</main>
</div>

{#if selected && selectedSection}
	{#key `${selected.progressionId}:${selected.index}`}
		<ChordSheet
			{song}
			tonic={sectionTonic(song, selectedSection)}
			progressionId={selected.progressionId}
			index={selected.index}
			sectionLabel={selectedSection.label}
			bar={selected.bar}
			onlevel={(delta) => {
				const sel = selected!;
				editor.apply((s) => adjustLevel(s, { kind: 'chord', progressionId: sel.progressionId, index: sel.index }, delta));
			}}
			onreplace={(degree) => {
				const sel = selected!;
				editor.apply((s) => replaceChord(s, sel.progressionId, sel.index, degree));
				announce('Chord replaced');
			}}
			onclose={closeChord}
		/>
	{/key}
{:else}
	<div class="bottombar">
		<div class="inner">
			<button class="btn icon" type="button" onclick={share} aria-label="Share link"><Icon name="share" /></button>
			<button
				class="btn icon"
				type="button"
				onclick={() => downloadJson(buildExport([$state.snapshot(song) as Song]), exportFileName([song]))}
				aria-label="Export song file"><Icon name="download" /></button
			>
			<a class="btn primary" href="/song/{song.id}/play" onclick={enterPlay}><Icon name="play" />Play</a>
		</div>
	</div>
{/if}

<style>
	.title-input {
		width: 100%;
		min-height: var(--tap);
		border: 1px solid transparent;
		border-radius: var(--radius);
		background: transparent;
		font-family: var(--display);
		font-size: 1.5rem;
		font-weight: 600;
		letter-spacing: -0.01em;
		padding: 0 8px;
		text-overflow: ellipsis;
		transition:
			background-color 0.2s,
			border-color 0.2s;
	}
	.title-input:hover,
	.title-input:focus {
		border-color: var(--border);
		background: var(--field);
	}
	.song-bar {
		padding: 12px;
		display: flex;
		flex-direction: column;
		gap: 12px;
		margin: 8px 0 16px;
		padding: 16px;
	}
	.facts {
		margin: 0;
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		font-size: 0.75rem;
		font-weight: 700;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--muted);
	}
	.settings-row {
		display: flex;
		flex-wrap: wrap;
		gap: 12px 16px;
		align-items: center;
	}
	.inline-field {
		display: flex;
		align-items: center;
		gap: 8px;
		font-weight: 600;
	}
	.bpm {
		width: 5.5em;
	}
	.shapes {
		font-weight: inherit;
	}
	.check {
		display: flex;
		align-items: center;
		gap: 8px;
		min-height: var(--tap);
		cursor: pointer;
	}
	.check input {
		width: 22px;
		height: 22px;
		accent-color: var(--accent);
	}
	.blocks {
		margin: 0;
		padding: 0;
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: 12px;
	}
	@media (min-width: 768px), (orientation: landscape) and (min-width: 600px) {
		.blocks {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}
	.extend {
		margin-top: 16px;
		padding: 16px;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.small-title {
		font-size: 1.25rem;
	}
	.row {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}
	.row .grow {
		flex: 1;
		min-width: 12em;
	}
	.empty {
		text-align: center;
		padding: 24px;
	}
	.sheet-open {
		padding-bottom: 340px;
	}
</style>
