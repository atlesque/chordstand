<script lang="ts" generics="T extends string | number">
	// A labelled radio group rendered as large chips: real radios, so keyboard and screen readers just work.
	type Option = { value: T; label: string; hint?: string };
	let {
		legend,
		name,
		options,
		value = $bindable(),
		columns = 0
	}: { legend: string; name: string; options: Option[]; value: T; columns?: number } = $props();
</script>

<fieldset class="group">
	<legend>{legend}</legend>
	<div class="chips" class:cols={columns > 0} style:--cols={columns || null}>
		{#each options as option (option.value)}
			<label class="chip">
				<input type="radio" {name} value={option.value} bind:group={value} />
				<span class="text">
					{option.label}
					{#if option.hint}<span class="hint">{option.hint}</span>{/if}
				</span>
			</label>
		{/each}
	</div>
</fieldset>

<style>
	.group {
		border: 0;
		margin: 0 0 20px;
		padding: 0;
		min-width: 0;
	}
	legend {
		font-family: var(--display);
		font-style: italic;
		font-weight: 600;
		font-size: 1.375rem;
		margin-bottom: 10px;
		padding: 0;
	}
	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}
	.chips.cols {
		display: grid;
		grid-template-columns: repeat(var(--cols), minmax(0, 1fr));
	}
	.chip {
		position: relative;
		display: flex;
	}
	.chip input {
		position: absolute;
		opacity: 0;
		inset: 0;
		margin: 0;
		cursor: pointer;
	}
	.text {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		width: 100%;
		min-height: var(--tap);
		padding: 6px 18px;
		border-radius: 999px;
		border: 1px solid var(--border);
		background: var(--surface);
		box-shadow: inset 0 1px 0 var(--hi);
		backdrop-filter: var(--glass);
		-webkit-backdrop-filter: var(--glass);
		font-weight: 600;
		text-align: center;
		line-height: 1.2;
		cursor: pointer;
		transition:
			transform 0.25s var(--ease),
			background-color 0.2s,
			border-color 0.2s,
			box-shadow 0.3s var(--ease);
	}
	.cols .text {
		border-radius: var(--radius);
	}
	@media (hover: hover) {
		.chip:hover .text {
			background-color: var(--surface-2);
			transform: translateY(-1px);
		}
	}
	.chip:active .text {
		transform: scale(0.95);
	}
	.hint {
		font-size: 0.75rem;
		font-weight: 500;
		color: var(--muted);
	}
	.chip input:checked + .text {
		background: linear-gradient(120deg, var(--accent), var(--accent-2));
		border-color: transparent;
		color: var(--accent-text);
		box-shadow:
			0 8px 22px -10px var(--glow),
			inset 0 1px 0 rgb(255 255 255 / 0.25);
		animation: pop 0.35s var(--spring);
	}
	.chip input:checked + .text .hint {
		color: inherit;
	}
	.chip input:focus-visible + .text {
		outline: 3px solid var(--focus);
		outline-offset: 2px;
	}
</style>
