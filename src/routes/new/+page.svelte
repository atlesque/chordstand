<script lang="ts">
	import { goto } from '$app/navigation';
	import ChoiceGroup from '$lib/components/ChoiceGroup.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import { COMPLEXITY_NAMES, FORM_IDS, FORMS, MOOD_IDS, MOODS, STYLE_IDS, STYLES } from '$lib/engine/data';
	import { generateSong } from '$lib/engine/generator';
	import { NOTE_CHOICES } from '$lib/engine/theory';
	import type { Complexity, FormId, MoodId, SetupChoices, StyleId, TimeSignature } from '$lib/engine/types';
	import { prefs, repo, savePrefs } from '$lib/state/app.svelte';

	const initial = $state.snapshot(prefs.lastSetup) as SetupChoices;

	let style = $state<StyleId>(initial.style);
	let mood = $state<MoodId>(initial.mood);
	let complexity = $state<Complexity>(initial.complexity);
	let form = $state<FormId>(initial.form);
	let length = $state(initial.length);
	let key = $state(initial.key);
	let timeSignature = $state<TimeSignature>(initial.timeSignature);
	let barsPerSection = $state<SetupChoices['barsPerSection']>(initial.barsPerSection);
	let seedText = $state(initial.seed === null ? '' : String(initial.seed));

	const styleOptions = STYLE_IDS.map((id) => ({ value: id, label: STYLES[id].name }));
	const moodOptions = MOOD_IDS.map((id) => ({ value: id, label: MOODS[id].name }));
	const complexityOptions = ([1, 2, 3, 4, 5] as Complexity[]).map((n) => ({
		value: n,
		label: String(n),
		hint: COMPLEXITY_NAMES[n - 1]
	}));
	const formOptions = FORM_IDS.map((id) => ({ value: id, label: FORMS[id].name }));
	const timeOptions = (['4/4', '3/4', '6/8'] as TimeSignature[]).map((t) => ({ value: t, label: t }));
	const barOptions = ([4, 8, 12, 16] as const).map((n) => ({ value: n, label: String(n) }));

	function generate(e: SubmitEvent) {
		e.preventDefault();
		const seedNum = Number.parseInt(seedText, 10);
		const choices: SetupChoices = {
			style,
			mood,
			complexity,
			form,
			length,
			key,
			timeSignature,
			barsPerSection,
			seed: Number.isFinite(seedNum) ? Math.abs(seedNum) : null
		};
		const song = generateSong(choices);
		repo().save(song);
		// Remember choices, but never pin a fixed seed by accident.
		prefs.lastSetup = { ...choices, seed: null };
		savePrefs();
		goto(`/song/${song.id}`);
	}
</script>

<svelte:head><title>Chordstand · New song</title></svelte:head>

<div class="page">
	<header class="topbar">
		<a class="btn icon ghost" href="/" aria-label="Back to your songs"><Icon name="left" /></a>
		<h1 class="grow">New song</h1>
	</header>

	<main id="main">
		<form id="setup" onsubmit={generate}>
			<ChoiceGroup legend="Style" name="style" options={styleOptions} bind:value={style} />
			<ChoiceGroup legend="Mood" name="mood" options={moodOptions} bind:value={mood} />
			<ChoiceGroup legend="Complexity" name="complexity" options={complexityOptions} bind:value={complexity} columns={5} />
			<ChoiceGroup legend="Form" name="form" options={formOptions} bind:value={form} />

			{#if form === 'length'}
				<div class="length">
					<span id="length-label" class="strong">Number of sections</span>
					<div class="stepper" role="group" aria-labelledby="length-label">
						<button class="btn icon" type="button" onclick={() => (length = Math.max(1, length - 1))} disabled={length <= 1} aria-label="Fewer sections"><Icon name="minus" /></button>
						<output class="count" aria-live="polite">{length}</output>
						<button class="btn icon" type="button" onclick={() => (length = Math.min(16, length + 1))} disabled={length >= 16} aria-label="More sections"><Icon name="plus" /></button>
					</div>
				</div>
			{/if}

			<details class="advanced">
				<summary>Advanced settings</summary>
				<div class="adv-body">
					<div class="field">
						<label for="key" class="strong">Key</label>
						<select id="key" class="input" bind:value={key}>
							<option value="random">Random (matches the mood)</option>
							{#each NOTE_CHOICES as note (note)}<option value={note}>{note}</option>{/each}
						</select>
					</div>
					<ChoiceGroup legend="Time signature" name="time" options={timeOptions} bind:value={timeSignature} columns={3} />
					{#if form !== 'blues12'}
						<ChoiceGroup legend="Bars per section" name="bars" options={barOptions} bind:value={barsPerSection} columns={4} />
					{/if}
					<div class="field">
						<label for="seed" class="strong">Seed</label>
						<input id="seed" class="input" inputmode="numeric" pattern="[0-9]*" placeholder="Random" bind:value={seedText} aria-describedby="seed-help" />
						<span id="seed-help" class="muted small">Same choices and seed always give the same song.</span>
					</div>
				</div>
			</details>
		</form>
	</main>
</div>

<div class="bottombar">
	<div class="inner">
		<button class="btn primary" type="submit" form="setup">Generate</button>
	</div>
</div>

<style>
	h1 {
		font-size: 1.375rem;
	}
	form {
		padding-top: 8px;
	}
	.strong {
		font-weight: 700;
	}
	.length {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		margin-bottom: 20px;
	}
	.stepper {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.count {
		min-width: 2ch;
		text-align: center;
		font-size: 1.25rem;
		font-weight: 700;
	}
	.advanced {
		border-top: 1px solid var(--border);
		padding-top: 8px;
	}
	summary {
		min-height: var(--tap);
		display: flex;
		align-items: center;
		font-weight: 700;
		cursor: pointer;
	}
	.adv-body {
		display: flex;
		flex-direction: column;
		gap: 16px;
		padding: 8px 0 16px;
	}
	.adv-body :global(fieldset) {
		margin-bottom: 0;
	}
	.small {
		font-size: 0.875rem;
	}
</style>
