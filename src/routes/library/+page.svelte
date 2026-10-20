<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { SvelteMap } from 'svelte/reactivity';
	import { goto, replaceState } from '$app/navigation';
	import { page } from '$app/state';
	import Icon from '$lib/components/Icon.svelte';
	import { colorOf, COMPLEXITY_NAMES, MODE_NAMES, MOOD_IDS, MOODS, STYLE_IDS, STYLES } from '$lib/engine/data';
	import { generateSong, setupFromLibrary } from '$lib/engine/generator';
	import { libraryStyles, loadLibrary } from '$lib/engine/library';
	import { PART_BARS, partBars } from '$lib/engine/library-check';
	import { highlight, indexSong, searchSongs, type IndexedSong, type Result } from '$lib/engine/search';
	import type { Complexity, Mode, MoodId, Role, StyleId } from '$lib/engine/types';
	import { announce, prefs, repo, showToast } from '$lib/state/app.svelte';

	// Icons only this page needs stay here, out of the shared icon set in the first-load bundle.
	const ICONS = {
		search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.35-4.35',
		check: 'M20 6 9 17l-5-5',
		shuffle: 'M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6M4 4l5 5'
	};

	const PAGE = 40;
	const ROLES = Object.keys(PART_BARS) as Role[];
	const ROLE_LABELS: Record<Role, string> = { intro: 'Intro', verse: 'Verse', chorus: 'Chorus', bridge: 'Bridge', outro: 'Outro' };
	const MODES: Mode[] = ['major', 'minor', 'dorian', 'lydian', 'mixolydian'];
	const LEVELS: Complexity[] = [1, 2, 3, 4, 5];
	const SORTS = { match: 'Best match', name: 'Name A–Z', simple: 'Simplest first', rich: 'Richest first' } as const;
	type Sort = keyof typeof SORTS;

	const available = new Set(libraryStyles());
	const styleIds = STYLE_IDS.filter((id) => available.has(id));

	// Filters live in the URL, so going back from a song lands on the same list.
	const params = page.url.searchParams;
	const listParam = <T extends string>(name: string, allowed: readonly T[]) =>
		new Set((params.get(name)?.split(',') ?? []).filter((v): v is T => (allowed as readonly string[]).includes(v)));
	let query = $state(params.get('q') ?? '');
	let styles = $state(listParam('style', styleIds));
	let moods = $state(listParam('mood', MOOD_IDS));
	let modes = $state(listParam('mode', MODES));
	let levels = $state(new Set([...listParam('level', ['1', '2', '3', '4', '5'])].map(Number) as Complexity[]));
	let sort = $state<Sort>((params.get('sort') as Sort) in SORTS ? (params.get('sort') as Sort) : 'match');

	// Searching ~10,000 songs is quick, but not free on a phone: wait for a pause in typing.
	let search = $state(params.get('q') ?? '');
	$effect(() => {
		const q = query;
		const t = setTimeout(() => (search = q), 120);
		return () => clearTimeout(t);
	});

	let items = $state.raw<IndexedSong[]>([]);
	let loading = $state(true);
	let shown = $state(PAGE);
	let expanded = $state<string | null>(null);
	const selected = new SvelteMap<string, IndexedSong>();
	let saved = $state(savedKeys());

	function savedKeys(): Set<string> {
		return new Set(repo().all().map((s) => `${s.settings.style}|${s.title}`));
	}
	const isSaved = (item: IndexedSong) => saved.has(`${item.style}|${item.song.name}`);

	onMount(async () => {
		const all = await Promise.all(
			styleIds.map(async (style) => {
				const name = STYLES[style].name;
				return (await loadLibrary(style)).map((song) =>
					indexSong(song, style, [
						name,
						style,
						MOODS[song.mood]?.name ?? song.mood,
						MODE_NAMES[song.mode],
						COMPLEXITY_NAMES[song.complexity - 1],
						...new Set(song.form)
					])
				);
			})
		);
		items = all.flat();
		loading = false;
	});

	const filtered = $derived(
		items.filter(
			(it) =>
				(!styles.size || styles.has(it.style)) &&
				(!moods.size || moods.has(it.song.mood)) &&
				(!modes.size || modes.has(it.song.mode)) &&
				(!levels.size || levels.has(it.song.complexity))
		)
	);
	const results = $derived.by((): Result[] => {
		const found = searchSongs(filtered, search);
		const byName = (a: Result, b: Result) => a.item.song.name.localeCompare(b.item.song.name);
		if (sort === 'name') return found.sort(byName);
		if (sort === 'simple') return found.sort((a, b) => a.item.song.complexity - b.item.song.complexity || byName(a, b));
		if (sort === 'rich') return found.sort((a, b) => b.item.song.complexity - a.item.song.complexity || byName(a, b));
		return found;
	});
	const activeCount = $derived(styles.size + moods.size + modes.size + levels.size);

	// Start from the top of the list whenever what it shows changes.
	$effect(() => {
		void results;
		shown = PAGE;
	});

	$effect(() => {
		const next = new URLSearchParams();
		if (search.trim()) next.set('q', search.trim());
		if (styles.size) next.set('style', [...styles].join(','));
		if (moods.size) next.set('mood', [...moods].join(','));
		if (modes.size) next.set('mode', [...modes].join(','));
		if (levels.size) next.set('level', [...levels].join(','));
		if (sort !== 'match') next.set('sort', sort);
		const qs = next.size ? `?${next}` : '';
		if (qs !== location.search) replaceState(`/library${qs}`, {});
	});

	// Load more as the end of the list scrolls into view; the button below is the fallback.
	let sentinel = $state<HTMLElement>();
	$effect(() => {
		if (!sentinel) return;
		const io = new IntersectionObserver((entries) => {
			if (entries.some((e) => e.isIntersecting)) shown += PAGE;
		}, { rootMargin: '600px' });
		io.observe(sentinel);
		return () => io.disconnect();
	});

	const toggle = <T,>(set: Set<T>, value: T): Set<T> => {
		const next = new Set(set);
		if (!next.delete(value)) next.add(value);
		return next;
	};

	function clearFilters() {
		styles = new Set();
		moods = new Set();
		modes = new Set();
		levels = new Set();
	}

	function cover(form: string[]): string {
		const stops = form.map((label) => `var(--c-${colorOf(label)})`);
		return `conic-gradient(from 200deg, ${[...stops, stops[0]].join(',')})`;
	}

	const cap = (s: string) => s[0].toUpperCase() + s.slice(1);
	const summary = (it: IndexedSong) =>
		`${STYLES[it.style].name} · ${MOODS[it.song.mood]?.name} · ${cap(MODE_NAMES[it.song.mode])} · ${COMPLEXITY_NAMES[it.song.complexity - 1]}`;
	// The chorus's first four bars tell apart songs that share a name.
	const hook = (it: IndexedSong) => partBars(it.song.parts.chorus ?? it.song.parts.verse ?? '').slice(0, 4).join(' · ');

	function toSong(it: IndexedSong) {
		return generateSong(setupFromLibrary(it.song, it.style, $state.snapshot(prefs.lastSetup)), { entry: it.song });
	}

	async function open(it: IndexedSong) {
		const song = toSong(it);
		repo().save(song);
		await goto(`/song/${song.id}`);
	}

	function add(list: IndexedSong[]) {
		for (const it of list) repo().save(toSong(it));
		saved = savedKeys();
		selected.clear();
		const msg = list.length === 1 ? `Added "${list[0].song.name}" to your songs` : `Added ${list.length} songs to your songs`;
		showToast(msg);
	}

	function toggleSelect(it: IndexedSong) {
		if (selected.has(it.song.id)) selected.delete(it.song.id);
		else selected.set(it.song.id, it);
	}

	async function surprise() {
		if (!results.length) return;
		const index = Math.floor(Math.random() * results.length);
		const it = results[index].item;
		shown = Math.max(shown, index + 1);
		expanded = it.song.id;
		await tick();
		const el = document.getElementById(`lib-${it.song.id}`);
		el?.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
		el?.querySelector<HTMLElement>('.head')?.focus({ preventScroll: true });
		announce(`Picked ${it.song.name}`);
	}
</script>

{#snippet icon(name: keyof typeof ICONS)}
	<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d={ICONS[name]} /></svg>
{/snippet}

<svelte:head><title>Chordstand · Song library</title></svelte:head>

<div class="page">
	<header class="topbar">
		<a class="btn icon ghost" href="/" aria-label="Back to your songs"><Icon name="left" /></a>
		<div class="grow">
			<p class="eyebrow">Browse</p>
			<h1>Song library</h1>
		</div>
		<a class="btn ghost" href="/new">Generate</a>
	</header>

	<main id="main">
		<div class="searchbar">
			<label class="search">
				<span class="visually-hidden">Search songs</span>
				{@render icon('search')}
				<input
					class="input"
					type="search"
					placeholder="Search names, moods, chords…"
					autocomplete="off"
					spellcheck="false"
					enterkeyhint="search"
					bind:value={query}
				/>
			</label>
		</div>

		<details class="filters" open={activeCount > 0}>
			<summary>Filters{#if activeCount}<span class="badge" aria-label="{activeCount} active">{activeCount}</span>{/if}</summary>
			<div class="filter-body">
				{#snippet group(legend: string, options: { value: string | number; label: string }[], set: Set<string | number>, update: (next: Set<never>) => void)}
					<fieldset>
						<legend>{legend}</legend>
						<div class="chips">
							{#each options as option (option.value)}
								<label class="chip">
									<input type="checkbox" checked={set.has(option.value)} onchange={() => update(toggle(set, option.value) as Set<never>)} />
									<span>{option.label}</span>
								</label>
							{/each}
						</div>
					</fieldset>
				{/snippet}
				{@render group('Style', styleIds.map((id) => ({ value: id, label: STYLES[id].name })), styles, (s) => (styles = s))}
				{@render group('Mood', MOOD_IDS.map((id) => ({ value: id, label: MOODS[id].name })), moods, (s) => (moods = s))}
				{@render group('Complexity', LEVELS.map((n) => ({ value: n, label: `${n} · ${COMPLEXITY_NAMES[n - 1]}` })), levels, (s) => (levels = s))}
				{@render group('Mode', MODES.map((m) => ({ value: m, label: cap(MODE_NAMES[m]) })), modes, (s) => (modes = s))}
				<div class="row">
					<div class="field sort">
						<label for="sort" class="strong">Sort</label>
						<select id="sort" class="input" bind:value={sort}>
							{#each Object.entries(SORTS) as [value, label] (value)}<option {value}>{label}</option>{/each}
						</select>
					</div>
					<button class="btn" type="button" onclick={clearFilters} disabled={!activeCount}>Clear filters</button>
				</div>
			</div>
		</details>

		<p class="count muted" aria-live="polite">
			{#if loading}Loading the library…{:else}{results.length.toLocaleString()} song{results.length === 1 ? '' : 's'}{/if}
		</p>

		{#if loading}
			<ul class="list" aria-hidden="true">
				{#each { length: 6 } as _, i (i)}<li class="card skeleton" style:--i={i}></li>{/each}
			</ul>
		{:else if !results.length}
			<section class="empty">
				<h2 class="display">No songs match</h2>
				<p class="muted">Try fewer words, or clear a filter or two.</p>
				<button class="btn" type="button" onclick={() => ((query = ''), clearFilters())}>Show all songs</button>
			</section>
		{:else}
			<ul class="list">
				{#each results.slice(0, shown) as { item, hits }, i (item.song.id)}
					{@const song = item.song}
					{@const isOpen = expanded === song.id}
					{@const picked = selected.has(song.id)}
					<li id="lib-{song.id}" class="card item" class:open={isOpen} class:picked style:--i={i % PAGE}>
						<div class="main-row">
							<label class="pick" style:background={cover(song.form)}>
								<input type="checkbox" checked={picked} onchange={() => toggleSelect(item)} />
								<span class="visually-hidden">Select {song.name}</span>
								<span class="tick" aria-hidden="true">{@render icon('check')}</span>
							</label>
							<button class="head" type="button" aria-expanded={isOpen} aria-controls="lib-body-{song.id}" onclick={() => (expanded = isOpen ? null : song.id)}>
								<span class="title"
									>{#each highlight(song.name, hits) as run, r (r)}{#if run.hit}<mark>{run.text}</mark>{:else}{run.text}{/if}{/each}</span
								>
								<span class="muted small">{summary(item)}</span>
								<span class="line">
									<span class="strip" aria-hidden="true">
										{#each song.form as label, k (k)}<span style:--tag="var(--c-{colorOf(label)})"></span>{/each}
									</span>
									<span class="hook muted">{hook(item)}</span>
								</span>
							</button>
							{#if isSaved(item)}<span class="saved small" title="Already in your songs">{@render icon('check')}<span class="visually-hidden">In your songs</span></span>{/if}
						</div>
						{#if isOpen}
							<div class="body" id="lib-body-{song.id}">
								<p class="small muted form">{song.form.join(' → ')}</p>
								<dl class="parts">
									{#each ROLES.filter((r) => song.parts[r] && song.form.includes(ROLE_LABELS[r])) as role (role)}
										<dt class="label-tag" style:--tag="var(--c-{colorOf(ROLE_LABELS[role])})">{ROLE_LABELS[role]}</dt>
										<dd>{#each partBars(song.parts[role] ?? '') as bar, b (b)}<span class="bar">{bar}</span>{/each}</dd>
									{/each}
								</dl>
								<p class="small muted">Chords are shown as numerals. The key is picked when you add the song, and you can change it later.</p>
								<div class="actions">
									<button class="btn primary" type="button" onclick={() => open(item)}><Icon name="play" />Use song</button>
									<button class="btn" type="button" onclick={() => add([item])}><Icon name="plus" />Add to my songs</button>
								</div>
							</div>
						{/if}
					</li>
				{/each}
			</ul>
			{#if shown < results.length}
				<div bind:this={sentinel} class="more">
					<button class="btn" type="button" onclick={() => (shown += PAGE)}>Show more</button>
				</div>
			{/if}
		{/if}
	</main>
</div>

<div class="bottombar">
	<div class="inner">
		{#if selected.size}
			<button class="btn" type="button" onclick={() => selected.clear()}>Clear</button>
			<button class="btn primary" type="button" onclick={() => add([...selected.values()])}>
				<Icon name="plus" />Add {selected.size} song{selected.size === 1 ? '' : 's'}
			</button>
		{:else}
			<button class="btn primary" type="button" onclick={surprise} disabled={loading || !results.length}>{@render icon('shuffle')}Surprise me</button>
		{/if}
	</div>
</div>

<style>
	h1 {
		font-size: 1.75rem;
	}
	.strong {
		font-weight: 700;
	}
	.small {
		font-size: 0.875rem;
	}
	.searchbar {
		position: sticky;
		top: 0;
		z-index: 10;
		margin: 0 -16px;
		padding: 8px 16px;
		background: color-mix(in srgb, var(--bg) 70%, transparent);
		backdrop-filter: var(--glass);
		-webkit-backdrop-filter: var(--glass);
	}
	.search {
		position: relative;
		display: block;
	}
	.search :global(svg) {
		position: absolute;
		left: 14px;
		top: 50%;
		translate: 0 -50%;
		width: 20px;
		height: 20px;
		color: var(--muted);
		pointer-events: none;
	}
	.search input {
		width: 100%;
		min-height: 52px;
		padding-left: 44px;
		font-size: 1.0625rem;
	}
	.filters {
		margin-top: 4px;
	}
	summary {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		min-height: var(--tap);
		font-weight: 700;
		cursor: pointer;
		list-style: none;
	}
	summary::-webkit-details-marker {
		display: none;
	}
	summary::after {
		content: '+';
		font-size: 1.25rem;
		font-weight: 400;
		color: var(--muted);
		transition: rotate 0.3s var(--spring);
	}
	.filters[open] summary::after {
		rotate: 45deg;
	}
	.badge {
		display: inline-grid;
		place-items: center;
		min-width: 22px;
		height: 22px;
		padding: 0 6px;
		border-radius: 11px;
		background: var(--accent);
		color: var(--accent-text);
		font-size: 0.75rem;
	}
	.filter-body {
		display: flex;
		flex-direction: column;
		gap: 14px;
		padding: 4px 0 12px;
		animation: rise 0.4s var(--ease);
	}
	fieldset {
		border: 0;
		margin: 0;
		padding: 0;
		min-width: 0;
	}
	legend {
		font-weight: 700;
		margin-bottom: 8px;
		padding: 0;
	}
	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}
	.chip {
		position: relative;
		display: flex;
	}
	.chip input,
	.pick input {
		position: absolute;
		z-index: 1;
		inset: 0;
		margin: 0;
		opacity: 0;
		cursor: pointer;
	}
	.chip span {
		display: flex;
		align-items: center;
		min-height: 40px;
		padding: 0 14px;
		border-radius: 20px;
		border: 1px solid var(--border);
		background: var(--surface);
		font-weight: 600;
		font-size: 0.9375rem;
		transition:
			background-color 0.2s,
			transform 0.2s var(--spring);
	}
	.chip:active span {
		transform: scale(0.95);
	}
	.chip input:checked + span {
		background: linear-gradient(120deg, var(--accent), var(--accent-2));
		border-color: transparent;
		color: var(--accent-text);
	}
	.chip input:focus-visible + span {
		outline: 3px solid var(--focus);
		outline-offset: 2px;
	}
	.row {
		display: flex;
		align-items: flex-end;
		gap: 8px;
		flex-wrap: wrap;
	}
	.sort {
		flex: 1;
		min-width: 160px;
	}
	.count {
		margin: 8px 0;
	}
	.list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.item {
		animation: rise 0.5s var(--ease) backwards;
		animation-delay: min(calc(var(--i, 0) * 30ms), 300ms);
		transition:
			border-color 0.2s,
			box-shadow 0.3s var(--ease);
	}
	.item.picked {
		border-color: var(--accent);
		box-shadow:
			0 0 0 2px var(--accent-soft),
			var(--shadow);
	}
	.skeleton {
		height: 84px;
		animation: rise 0.5s var(--ease) backwards, shimmer 1.4s ease-in-out infinite;
		animation-delay: calc(var(--i) * 60ms), 0s;
	}
	@keyframes shimmer {
		50% {
			opacity: 0.55;
		}
	}
	.main-row {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 10px 12px;
	}
	.pick {
		position: relative;
		flex: none;
		display: grid;
		place-items: center;
		width: 52px;
		height: 52px;
		border-radius: 16px;
		cursor: pointer;
		box-shadow: inset 0 0 0 1px rgb(255 255 255 / 0.2);
	}
	.tick {
		display: grid;
		place-items: center;
		width: 30px;
		height: 30px;
		border-radius: 50%;
		background: rgb(0 0 0 / 0.25);
		color: #fff;
		opacity: 0;
		scale: 0.6;
		transition:
			opacity 0.2s,
			scale 0.3s var(--spring);
	}
	.tick :global(svg) {
		width: 18px;
		height: 18px;
		stroke-width: 3;
	}
	@media (hover: hover) {
		.pick:hover .tick {
			opacity: 0.6;
			scale: 0.85;
		}
	}
	.pick input:checked ~ .tick {
		opacity: 1;
		scale: 1;
		background: var(--accent);
		color: var(--accent-text);
	}
	.pick input:focus-visible ~ .tick {
		opacity: 1;
		outline: 3px solid var(--focus);
		outline-offset: 2px;
	}
	.head {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 2px;
		min-height: var(--tap);
		padding: 0;
		border: 0;
		background: none;
		text-align: left;
		cursor: pointer;
	}
	.title {
		font-weight: 700;
		font-size: 1.0625rem;
		max-width: 100%;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	mark {
		background: none;
		color: inherit;
		text-decoration: underline 2px var(--accent-2);
		text-underline-offset: 3px;
	}
	.line {
		display: flex;
		align-items: center;
		gap: 10px;
		max-width: 100%;
		margin-top: 4px;
	}
	.strip {
		flex: none;
		display: flex;
		gap: 3px;
	}
	.hook {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-family: var(--mono);
		font-size: 0.75rem;
	}
	.strip span {
		width: 10px;
		height: 4px;
		border-radius: 2px;
		background: var(--tag);
	}
	.saved {
		flex: none;
		display: grid;
		place-items: center;
		width: 28px;
		height: 28px;
		border-radius: 50%;
		background: var(--accent-soft);
		color: var(--accent);
	}
	.saved :global(svg) {
		width: 16px;
		height: 16px;
	}
	.body {
		padding: 0 12px 14px;
		animation: rise 0.35s var(--ease);
	}
	.form {
		margin: 0 0 10px;
	}
	.parts {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: 8px 14px;
		align-items: start;
		margin: 0 0 10px;
	}
	.parts dt {
		min-height: 32px;
	}
	.parts dd {
		margin: 0;
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
	}
	.bar {
		min-width: 3.25rem;
		padding: 5px 8px;
		border-radius: 8px;
		background: var(--surface-2);
		border: 1px solid var(--border);
		font-family: var(--mono);
		font-size: 0.875rem;
		text-align: center;
		white-space: nowrap;
	}
	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}
	.actions .btn {
		flex: 1;
		white-space: nowrap;
	}
	.more {
		display: flex;
		justify-content: center;
		padding: 16px 0;
	}
	.empty {
		text-align: center;
		padding: 32px 0;
	}
</style>
