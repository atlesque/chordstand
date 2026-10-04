<script lang="ts">
	import { goto } from '$app/navigation';
	import Icon from '$lib/components/Icon.svelte';
	import ThemeToggle from '$lib/components/ThemeToggle.svelte';
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
	import { announce, repo, showToast } from '$lib/state/app.svelte';
	import { duplicateSong, setTitle } from '$lib/engine/meta';
	import { songSummary } from '$lib/engine/names';
	import { colorOf } from '$lib/engine/data';
	import { buildExport, downloadJson, exportFileName, parseImport } from '$lib/storage/transfer';
	import type { Song } from '$lib/engine/types';

	type Row = { song: Song; open: boolean };

	let rows = $state<Row[]>([]);
	let invalid = $state(0);
	let status = $state(repo().status);
	let renamingId = $state<string | null>(null);
	let titleDraft = $state('');
	let confirmDelete = $state<Song | null>(null);
	let fileInput: HTMLInputElement;

	function load() {
		const r = repo();
		const previous = new Map(rows.map((row) => [row.song.id, row.open]));
		rows = r.all().map((song) => ({ song, open: previous.get(song.id) ?? false }));
		invalid = r.invalidIds().length;
		status = r.status;
	}
	load();

	// Each song gets a little cover: a colour swirl of its own sections, in order.
	function cover(song: Song): string {
		const stops = song.sections.map((s) => `var(--c-${colorOf(s.label)})`);
		return stops.length ? `conic-gradient(from 200deg, ${[...stops, stops[0]].join(',')})` : 'var(--accent-soft)';
	}

	function relative(iso: string): string {
		const diff = Date.now() - new Date(iso).getTime();
		const min = Math.round(diff / 60000);
		if (min < 1) return 'just now';
		if (min < 60) return `${min} min ago`;
		const h = Math.round(min / 60);
		if (h < 24) return `${h} h ago`;
		const d = Math.round(h / 24);
		if (d < 7) return `${d} day${d === 1 ? '' : 's'} ago`;
		return new Date(iso).toLocaleDateString();
	}

	function startRename(song: Song) {
		renamingId = song.id;
		titleDraft = song.title;
		queueMicrotask(() => document.getElementById(`title-${song.id}`)?.focus());
	}

	function saveRename(e: SubmitEvent, song: Song) {
		e.preventDefault();
		repo().save(setTitle(song, titleDraft));
		renamingId = null;
		load();
		announce('Song renamed');
	}

	function duplicate(song: Song) {
		const copy = duplicateSong(song);
		repo().save(copy);
		load();
		announce(`Duplicated as ${copy.title}`);
	}

	function remove(song: Song) {
		const index = rows.findIndex((r) => r.song.id === song.id);
		repo().delete(song.id);
		confirmDelete = null;
		load();
		showToast(`Deleted "${song.title}"`, {
			label: 'Undo',
			run: () => {
				repo().save(song);
				load();
				announce('Song restored');
			}
		});
		// Return focus to a sensible place: the next song, or the New song button.
		queueMicrotask(() => {
			const next = document.querySelectorAll<HTMLElement>('.song-link')[Math.min(index, rows.length - 1)];
			(next ?? document.getElementById('new-song'))?.focus();
		});
	}

	function exportAll() {
		const songs = repo().all();
		downloadJson(buildExport(songs), exportFileName(songs));
	}

	async function importFile(e: Event) {
		const input = e.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		input.value = '';
		if (!file) return;
		const { songs, skipped } = parseImport(await file.text());
		const r = repo();
		for (const song of songs) {
			// Keep both copies when an imported song collides with one that's already here.
			const existing = r.get(song.id);
			r.save(existing && JSON.stringify(existing) !== JSON.stringify(song) ? duplicateSong(song, song.title) : song);
		}
		load();
		const msg = `Imported ${songs.length} song${songs.length === 1 ? '' : 's'}${skipped ? `, skipped ${skipped} that couldn't be read` : ''}.`;
		showToast(msg);
		announce(msg);
	}
</script>

<svelte:head><title>Chordstand · Your songs</title></svelte:head>

<div class="page">
	<header class="topbar hero">
		<div class="grow">
			<p class="eyebrow">Songs for the music stand</p>
			<h1 class="brand">Chord<em>stand</em></h1>
			<svg class="squiggle" viewBox="0 0 200 12" aria-hidden="true" focusable="false"
				><path d="M2 8c14-8 26-8 38 0s24 8 38 0 26-8 38 0 24 8 38 0 26-8 38 0" pathLength="1" /></svg
			>
		</div>
		<ThemeToggle />
	</header>

	<main id="main">
		{#if status.message}
			<p class="notice warn" role="alert">{status.message}</p>
		{:else if status.nearQuota}
			<p class="notice warn">Storage is almost full. Export your songs to keep a backup, then delete some you no longer need.</p>
		{/if}
		{#if invalid}
			<p class="notice">{invalid} saved song{invalid === 1 ? '' : 's'} couldn't be opened and {invalid === 1 ? 'was' : 'were'} skipped.</p>
		{/if}

		{#if rows.length === 0}
			<section class="empty rise">
				<div class="orb" aria-hidden="true"></div>
				<h2 class="display">Your first song is three taps away</h2>
				<p class="muted">Pick a style, a mood and how rich the chords should be. Chordstand writes a full song structure you can rearrange and play from your music stand.</p>
				<a class="btn primary" href="/new">Create a song</a>
			</section>
		{:else}
			<h2 class="list-title display">Your songs <span class="muted">({rows.length})</span></h2>
			<ul class="songs">
				{#each rows as row, i (row.song.id)}
					{@const song = row.song}
					<li class="card song rise" style:--i={i}>
						<div class="main-row">
							{#if renamingId === song.id}
								<form class="rename" onsubmit={(e) => saveRename(e, song)}>
									<label class="visually-hidden" for="title-{song.id}">Song title</label>
									<input class="input" id="title-{song.id}" bind:value={titleDraft} maxlength="80" />
									<button class="btn primary" type="submit">Save</button>
									<button class="btn" type="button" onclick={() => (renamingId = null)}>Cancel</button>
								</form>
							{:else}
								<a class="song-link" href="/song/{song.id}">
									<span class="cover" style:background={cover(song)} aria-hidden="true"></span>
									<span class="text">
										<span class="title">{song.title}</span>
										<span class="muted small">{songSummary(song)}</span>
										<span class="muted small">Edited {relative(song.updatedAt)}</span>
									</span>
								</a>
								<button
									class="btn icon ghost"
									type="button"
									aria-expanded={row.open}
									aria-controls="song-actions-{song.id}"
									aria-label="More actions for {song.title}"
									onclick={() => (row.open = !row.open)}
								>
									<Icon name="more" />
								</button>
							{/if}
						</div>
						{#if row.open && renamingId !== song.id}
							<div class="actions" id="song-actions-{song.id}">
								<a class="btn" href="/song/{song.id}/play"><Icon name="play" />Play</a>
								<button class="btn" type="button" onclick={() => startRename(song)}><Icon name="edit" />Rename</button>
								<button class="btn" type="button" onclick={() => duplicate(song)}><Icon name="copy" />Duplicate</button>
								<button class="btn" type="button" onclick={() => downloadJson(buildExport([song]), exportFileName([song]))}><Icon name="download" />Export</button>
								<button class="btn danger" type="button" onclick={() => (confirmDelete = song)}><Icon name="trash" />Delete</button>
							</div>
						{/if}
					</li>
				{/each}
			</ul>
		{/if}

		<section class="tools rise" style:--i={rows.length + 1} aria-labelledby="backup-title">
			<h2 id="backup-title" class="small-title display">Backup</h2>
			<p class="muted small">Songs are stored only in this browser. Export a file to back them up or move them to another device.</p>
			<div class="row">
				<button class="btn" type="button" onclick={exportAll} disabled={rows.length === 0}><Icon name="download" />Export all</button>
				<button class="btn" type="button" onclick={() => fileInput.click()}><Icon name="upload" />Import</button>
				<input bind:this={fileInput} class="visually-hidden" type="file" accept="application/json,.json" onchange={importFile} tabindex="-1" aria-hidden="true" />
			</div>
		</section>
	</main>
</div>

<div class="bottombar">
	<div class="inner">
		<button id="new-song" class="btn primary" type="button" onclick={() => goto('/new')}><Icon name="plus" />New song</button>
	</div>
</div>

{#if confirmDelete}
	{@const song = confirmDelete}
	<ConfirmDialog
		title="Delete this song?"
		message={`"${song.title}" will be removed from this browser.`}
		onconfirm={() => remove(song)}
		oncancel={() => (confirmDelete = null)}
	/>
{/if}

<style>
	.hero {
		align-items: flex-start;
		padding: 12px 0 20px;
	}
	.brand {
		font-size: clamp(2.5rem, 11vw, 3.75rem);
		font-weight: 800;
		letter-spacing: -0.04em;
		line-height: 1;
		margin-top: 6px;
	}
	.brand em {
		font-style: normal;
		font-weight: 400;
		background: linear-gradient(100deg, var(--accent), var(--accent-2));
		-webkit-background-clip: text;
		background-clip: text;
		color: transparent;
		padding-right: 0.08em;
	}
	.squiggle {
		display: block;
		width: 132px;
		height: 12px;
		margin-top: 8px;
		fill: none;
		stroke: var(--accent-2);
		stroke-width: 2.5;
		stroke-linecap: round;
		stroke-dasharray: 1;
		animation: draw 1.4s 0.2s var(--ease) backwards;
	}
	@keyframes draw {
		from {
			stroke-dashoffset: 1;
		}
	}
	.empty {
		text-align: center;
		padding: 24px 8px 48px;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 12px;
	}
	.empty h2 {
		font-size: 1.75rem;
		max-width: 14em;
	}
	.orb {
		width: 132px;
		height: 132px;
		margin-bottom: 12px;
		border-radius: 50%;
		background: conic-gradient(from 0deg, var(--c-verse), var(--c-chorus), var(--c-bridge), var(--c-a), var(--c-b), var(--c-verse));
		box-shadow: 0 24px 60px -20px var(--glow), inset 0 0 30px rgb(255 255 255 / 0.35);
		animation:
			spin 24s linear infinite,
			float 6s ease-in-out infinite alternate;
	}
	@keyframes spin {
		to {
			rotate: 360deg;
		}
	}
	@keyframes float {
		to {
			translate: 0 -10px;
		}
	}
	.empty p {
		max-width: 34em;
		margin: 0;
	}
	.list-title {
		font-size: 1.5rem;
		margin: 8px 0 14px;
	}
	.list-title .muted {
		font-family: var(--font);
		font-size: 1rem;
		font-weight: 500;
	}
	.songs {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.song {
		padding: 4px 4px 4px 0;
		transition:
			transform 0.3s var(--ease),
			box-shadow 0.3s var(--ease);
	}
	@media (hover: hover) {
		.song:hover {
			transform: translateY(-2px);
			box-shadow:
				0 18px 40px -18px var(--glow),
				inset 0 1px 0 var(--hi);
		}
		.song:hover .cover {
			rotate: 40deg;
		}
	}
	.main-row {
		display: flex;
		align-items: center;
	}
	.song-link {
		flex: 1;
		min-width: 0;
		display: flex;
		align-items: center;
		gap: 14px;
		padding: 8px 12px;
		color: inherit;
		text-decoration: none;
		border-radius: var(--radius);
	}
	.cover {
		width: 52px;
		height: 52px;
		flex: none;
		border-radius: 50%;
		box-shadow: inset 0 0 0 1px rgb(255 255 255 / 0.25), inset 0 0 14px rgb(0 0 0 / 0.25), 0 6px 16px -8px rgb(0 0 0 / 0.5);
		transition: rotate 0.8s var(--ease);
	}
	.text {
		min-width: 0;
		display: flex;
		flex-direction: column;
	}
	.title {
		font-family: var(--display);
		font-weight: 600;
		font-size: 1.1875rem;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.small {
		font-size: 0.875rem;
	}
	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		padding: 4px 12px 8px;
		animation: rise 0.4s var(--ease) backwards;
	}
	.rename {
		display: flex;
		gap: 8px;
		flex: 1;
		padding: 8px 0 8px 12px;
	}
	.rename .input {
		flex: 1;
		min-width: 0;
	}
	.tools {
		margin-top: 32px;
		padding-top: 16px;
		border-top: 1px solid var(--border);
	}
	.small-title {
		font-size: 1.25rem;
	}
	.row {
		display: flex;
		gap: 8px;
		flex-wrap: wrap;
	}
</style>
