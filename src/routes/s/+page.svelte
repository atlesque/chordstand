<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import Icon from '$lib/components/Icon.svelte';
	import NotFound from '$lib/components/NotFound.svelte';
	import { colorOf, MOODS, STYLES } from '$lib/engine/data';
	import { newId } from '$lib/engine/generator';
	import { renderSection, songTonalityLabel } from '$lib/engine/song';
	import { repo, showToast } from '$lib/state/app.svelte';
	import { decodeSong } from '$lib/storage/share';
	import type { Song } from '$lib/engine/types';

	let song = $state<Song | null>(null);
	let status = $state<'loading' | 'ready' | 'invalid'>('loading');

	async function load() {
		const hash = location.hash.slice(1);
		song = hash ? await decodeSong(hash) : null;
		status = song ? 'ready' : 'invalid';
	}

	onMount(() => {
		load();
		window.addEventListener('hashchange', load);
		return () => window.removeEventListener('hashchange', load);
	});

	function save() {
		if (!song) return;
		const now = new Date().toISOString();
		const copy: Song = { ...$state.snapshot(song), id: newId(), createdAt: now, updatedAt: now } as Song;
		repo().save(copy);
		showToast('Saved to your library');
		goto(`/song/${copy.id}`, { replaceState: true });
	}
</script>

<svelte:head><title>{song ? `${song.title} · Shared` : 'Shared song'} · Chordstand</title></svelte:head>

{#if status === 'invalid'}
	<NotFound title="Link not readable" message="This share link is incomplete or damaged. Ask for the link again, or open the song from an exported file." />
{:else if song}
	<div class="page">
		<header class="topbar">
			<a class="btn icon ghost" href="/" aria-label="Your songs"><Icon name="library" /></a>
			<h1 class="grow">{song.title}</h1>
		</header>
		<main id="main">
			<p class="muted">
				Shared song · {STYLES[song.settings.style]?.name ?? song.settings.style} · {MOODS[song.settings.mood]?.name ?? song.settings.mood}
				· {songTonalityLabel(song)} · {song.settings.bpm} BPM
			</p>
			<ol class="sections">
				{#each song.sections as section (section.id)}
					<li class="card section" style:--tag="var(--c-{colorOf(section.label)})">
						<h2 class="label-tag">{section.label} <span class="muted small">{section.bars} bars</span></h2>
						<p class="chords">
							{#each renderSection(song, section) as bar (bar.bar)}
								<span class="bar">
									{#each bar.chords as c (c.index)}<span class="visually-hidden">{c.chord.spoken}</span><span aria-hidden="true">{c.chord.symbol}</span>{' '}{/each}
								</span>
							{/each}
						</p>
					</li>
				{/each}
			</ol>
		</main>
	</div>
	<div class="bottombar">
		<div class="inner">
			<button class="btn primary" type="button" onclick={save}><Icon name="download" />Save to my library</button>
		</div>
	</div>
{/if}

<style>
	h1 {
		font-size: 1.25rem;
	}
	.sections {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.section {
		padding: 12px;
		border-left: 6px solid var(--tag);
	}
	h2 {
		font-size: 1.0625rem;
	}
	.small {
		font-size: 0.875rem;
		font-weight: 500;
	}
	.chords {
		margin: 8px 0 0;
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 4px;
		font-size: 1.25rem;
		font-weight: 700;
	}
	.bar {
		border-left: 2px solid var(--border);
		padding-left: 6px;
	}
</style>
