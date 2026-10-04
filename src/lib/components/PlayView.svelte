<script lang="ts">
	import { onDestroy, onMount, tick } from 'svelte';
	import { goto } from '$app/navigation';
	import Icon from './Icon.svelte';
	import ThemeToggle from './ThemeToggle.svelte';
	import { colorOf } from '$lib/engine/data';
	import { renderSection, songTonalityLabel } from '$lib/engine/song';
	import { prefs, savePrefs } from '$lib/state/app.svelte';
	import type { Song } from '$lib/engine/types';

	let { song, backHref }: { song: Song; backHref: string } = $props();

	let current = $state(0);
	let wakeSupported = $state(false);
	let wakeLock: WakeLockSentinel | null = null;
	let advanceTimer: ReturnType<typeof setTimeout> | undefined;
	let cycle = $state(0); // restarts the progress bar animation
	let reducedMotion = false;

	const rendered = $derived(song.sections.map((section) => ({ section, bars: renderSection(song, section) })));
	const total = $derived(song.sections.length);

	function beatsPerBar(): number {
		// BPM counts quarter notes in 4/4 and 3/4, dotted quarters in 6/8.
		return song.settings.timeSignature === '3/4' ? 3 : song.settings.timeSignature === '6/8' ? 2 : 4;
	}
	const sectionMs = $derived(
		((song.sections[current]?.bars ?? 0) * beatsPerBar() * 60000) / Math.max(30, song.settings.bpm)
	);

	async function go(index: number) {
		const next = Math.max(0, Math.min(total - 1, index));
		if (next === current) return;
		current = next;
		cycle++;
		await tick();
		document
			.getElementById(`play-${song.sections[current].id}`)
			?.scrollIntoView({ block: 'center', behavior: reducedMotion ? 'auto' : 'smooth' });
	}

	const next = () => go(current + 1);
	const prev = () => go(current - 1);

	/* ---------- Auto-advance by tempo ---------- */
	$effect(() => {
		clearTimeout(advanceTimer);
		void cycle;
		if (!prefs.autoAdvance || current >= total - 1) return;
		advanceTimer = setTimeout(next, sectionMs);
		return () => clearTimeout(advanceTimer);
	});

	/* ---------- Keep the screen awake ---------- */
	async function acquireWakeLock() {
		if (!('wakeLock' in navigator) || !prefs.wakeLock || document.visibilityState !== 'visible') return;
		try {
			wakeLock = await navigator.wakeLock.request('screen');
		} catch {
			wakeLock = null;
		}
	}
	async function releaseWakeLock() {
		try {
			await wakeLock?.release();
		} catch {
			/* ignore */
		}
		wakeLock = null;
	}
	function onVisibility() {
		if (document.visibilityState === 'visible') acquireWakeLock();
	}
	function toggleWake() {
		prefs.wakeLock = !prefs.wakeLock;
		savePrefs();
		if (prefs.wakeLock) acquireWakeLock();
		else releaseWakeLock();
	}
	function toggleAuto() {
		prefs.autoAdvance = !prefs.autoAdvance;
		savePrefs();
		cycle++;
	}

	onMount(() => {
		wakeSupported = 'wakeLock' in navigator;
		reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
		acquireWakeLock();
		document.addEventListener('visibilitychange', onVisibility);
	});

	onDestroy(() => {
		clearTimeout(advanceTimer);
		releaseWakeLock();
		if (typeof document !== 'undefined') {
			document.removeEventListener('visibilitychange', onVisibility);
			if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
		}
	});

	/* ---------- Tap halves, swipe, keys ---------- */
	let start: { x: number; y: number; id: number } | null = null;
	function onpointerdown(e: PointerEvent) {
		if ((e.target as HTMLElement).closest('button, a, input, select')) return;
		start = { x: e.clientX, y: e.clientY, id: e.pointerId };
	}
	function onpointerup(e: PointerEvent) {
		if (!start || start.id !== e.pointerId) return;
		const dx = e.clientX - start.x;
		const dy = e.clientY - start.y;
		start = null;
		if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) {
			if (dx < 0) next();
			else prev();
		} else if (Math.abs(dx) < 12 && Math.abs(dy) < 12) {
			if (e.clientX < window.innerWidth / 2) prev();
			else next();
		}
	}
	function onkeydown(e: KeyboardEvent) {
		if ((e.target as HTMLElement).closest('input, select')) return;
		if (['ArrowRight', 'ArrowDown', 'PageDown', ' '].includes(e.key)) {
			e.preventDefault();
			next();
		} else if (['ArrowLeft', 'ArrowUp', 'PageUp'].includes(e.key)) {
			e.preventDefault();
			prev();
		} else if (e.key === 'Escape') {
			goto(backHref);
		}
	}

	function toggleFullscreen() {
		if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
		else document.documentElement.requestFullscreen?.().catch(() => {});
	}
</script>

<svelte:window {onkeydown} />
<svelte:head><title>Play · {song.title} · Chordstand</title></svelte:head>

<div class="play">
	<header class="controls">
		<a class="btn icon ghost" href={backHref} aria-label="Back to editor"><Icon name="left" /></a>
		<div class="where">
			<h1 class="song-title">{song.title}</h1>
			<p class="muted" aria-live="polite">
				{song.sections[current]?.label}, section {current + 1} of {total} · {songTonalityLabel(song)} · {song.settings.bpm} BPM
			</p>
		</div>
		<button class="btn icon ghost" type="button" aria-pressed={prefs.autoAdvance} onclick={toggleAuto} aria-label="Auto-advance at {song.settings.bpm} BPM" title="Auto-advance">
			<Icon name="play" />
		</button>
		{#if wakeSupported}
			<button class="btn icon ghost" type="button" aria-pressed={prefs.wakeLock} onclick={toggleWake} aria-label="Keep screen awake" title="Keep screen awake">
				<Icon name="eye" />
			</button>
		{/if}
		<ThemeToggle />
		<button class="btn icon ghost" type="button" onclick={toggleFullscreen} aria-label="Full screen"><Icon name="expand" /></button>
	</header>

	{#if prefs.autoAdvance && current < total - 1}
		{#key cycle}
			<div class="progress" style:--ms="{sectionMs}ms" aria-hidden="true"></div>
		{/key}
	{/if}

	<main id="main" class="sheet" {onpointerdown} {onpointerup}>
		{#each rendered as { section, bars }, i (section.id)}
			<section
				id="play-{section.id}"
				class="section"
				class:current={i === current}
				aria-current={i === current ? 'step' : undefined}
				style:--tag="var(--c-{colorOf(section.label)})"
				aria-labelledby="play-label-{section.id}"
			>
				<h2 class="label-tag" id="play-label-{section.id}">
					{section.label}
					{#if section.transpose}<span class="muted">key +{section.transpose}</span>{/if}
				</h2>
				<ol class="bars">
					{#each bars as bar (bar.bar)}
						<li class="bar">
							{#each bar.chords as c (c.index)}
								<span class="chord">
									<span class="visually-hidden">{c.chord.spoken}</span>
									<span aria-hidden="true">{c.chord.symbol}</span>
									{#if prefs.showNumerals}<span class="num" aria-hidden="true">{c.chord.numeral}</span>{/if}
								</span>
							{/each}
						</li>
					{/each}
				</ol>
			</section>
		{/each}
	</main>

	<nav class="nav" aria-label="Sections">
		<button class="btn" type="button" onclick={prev} disabled={current === 0}><Icon name="left" />Previous</button>
		<button class="btn primary" type="button" onclick={next} disabled={current >= total - 1}>Next section<Icon name="right" /></button>
	</nav>
</div>

<style>
	.play {
		/* High-contrast stage: pure black on white, or white on black in dark theme. */
		--stage-bg: #ffffff;
		--stage-text: #000000;
		min-height: 100dvh;
		background: var(--stage-bg);
		color: var(--stage-text);
		display: flex;
		flex-direction: column;
	}
	:global(:root[data-theme='dark']) .play {
		--stage-bg: #000000;
		--stage-text: #ffffff;
	}
	@media (prefers-color-scheme: dark) {
		:global(:root:not([data-theme='light'])) .play {
			--stage-bg: #000000;
			--stage-text: #ffffff;
		}
	}
	.controls {
		position: sticky;
		top: 0;
		z-index: 10;
		display: flex;
		align-items: center;
		gap: 2px;
		padding: 4px 8px;
		background: color-mix(in srgb, var(--stage-bg) 80%, transparent);
		border-bottom: 1px solid var(--border);
		backdrop-filter: var(--glass);
		-webkit-backdrop-filter: var(--glass);
	}
	.controls :global(.btn[aria-pressed='true']) {
		background: linear-gradient(120deg, var(--accent), var(--accent-2));
		color: var(--accent-text);
		box-shadow: 0 6px 18px -8px var(--glow);
	}
	.where {
		flex: 1;
		min-width: 0;
		padding: 0 4px;
	}
	.song-title {
		font-size: 1.125rem;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.where p {
		margin: 0;
		font-size: 0.8125rem;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.progress {
		height: 4px;
		background: linear-gradient(90deg, var(--accent), var(--accent-2));
		box-shadow: 0 0 12px var(--glow);
		transform-origin: left;
		animation: grow var(--ms) linear forwards;
	}
	@keyframes grow {
		from {
			transform: scaleX(0);
		}
		to {
			transform: scaleX(1);
		}
	}
	.sheet {
		flex: 1;
		padding: 12px 12px 120px;
		display: flex;
		flex-direction: column;
		gap: 12px;
		user-select: none;
		-webkit-user-select: none;
		max-width: 1200px;
		width: 100%;
		margin: 0 auto;
	}
	.section {
		border: 2px solid transparent;
		border-left: 8px solid var(--tag);
		border-radius: var(--radius-lg);
		padding: 8px 12px 12px;
		opacity: 0.55;
		transition:
			opacity 0.4s var(--ease),
			border-color 0.4s var(--ease),
			box-shadow 0.5s var(--ease),
			transform 0.5s var(--ease);
		transform: scale(0.985);
	}
	.section.current {
		opacity: 1;
		transform: none;
		border-color: var(--stage-text);
		border-left-color: var(--tag);
		/* Lit from behind in the section's colour; the chords themselves stay pure black or white. */
		box-shadow: 0 18px 60px -24px var(--tag);
	}
	h2 {
		font-family: var(--display);
		font-size: 1.375rem;
		font-weight: 600;
		margin-bottom: 8px;
	}
	.bars {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 8px;
	}
	@media (min-width: 560px) {
		.bars {
			grid-template-columns: repeat(4, minmax(0, 1fr));
		}
	}
	.bar {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		justify-content: space-around;
		gap: 0 12px;
		padding: 8px 4px;
		border-left: 2px solid var(--border);
		min-width: 0;
	}
	.chord {
		display: inline-flex;
		flex-direction: column;
		align-items: center;
		font-size: clamp(2rem, 7.5vw, 3.75rem);
		font-weight: 800;
		letter-spacing: -0.02em;
		line-height: 1.1;
		overflow-wrap: anywhere;
	}
	.num {
		font-size: 0.875rem;
		font-weight: 600;
		font-family: var(--mono);
		opacity: 0.75;
	}
	.nav {
		position: fixed;
		left: 0;
		right: 0;
		bottom: 0;
		display: flex;
		gap: 8px;
		padding: 8px 12px calc(8px + env(safe-area-inset-bottom, 0px));
		background: color-mix(in srgb, var(--stage-bg) 80%, transparent);
		border-top: 1px solid var(--border);
		backdrop-filter: var(--glass);
		-webkit-backdrop-filter: var(--glass);
	}
	.nav .btn {
		flex: 1;
		min-height: 56px;
		font-size: 1.0625rem;
	}
</style>
