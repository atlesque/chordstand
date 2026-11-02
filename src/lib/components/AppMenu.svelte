<script lang="ts">
	// App menu: theme, the song library and privacy settings in one place.
	// Uses the native popover API, so opening, closing on outside tap and Escape need no JS.
	import Icon from './Icon.svelte';
	import { applyTheme, prefs, savePrefs, type Theme } from '$lib/state/app.svelte';

	let { library = true }: { library?: boolean } = $props();

	const THEMES: { id: Theme; name: string; icon: string }[] = [
		{ id: 'system', name: 'Auto', icon: 'auto' },
		{ id: 'light', name: 'Light', icon: 'sun' },
		{ id: 'dark', name: 'Dark', icon: 'moon' }
	];
	const uid = `app-menu-${Math.random().toString(36).slice(2, 8)}`;
	let menu: HTMLElement;

	function setTheme(theme: Theme) {
		prefs.theme = theme;
		applyTheme(theme);
		savePrefs();
	}
</script>

<button class="btn icon ghost" type="button" popovertarget={uid} aria-label="Menu" title="Menu">
	<Icon name="menu" />
</button>

<div bind:this={menu} id={uid} class="menu" popover="auto" aria-label="Menu">
	<p class="label" id="{uid}-theme">Theme</p>
	<div class="themes" role="group" aria-labelledby="{uid}-theme">
		{#each THEMES as t (t.id)}
			<button class="theme" type="button" aria-pressed={prefs.theme === t.id} onclick={() => setTheme(t.id)}>
				<Icon name={t.icon} />{t.name}
			</button>
		{/each}
	</div>
	{#if library}
		<a class="item" href="/library" onclick={() => menu.hidePopover()}><Icon name="library" />Song library</a>
	{/if}
	<!-- The shared consent script (app.html) opens its settings from any [data-privacy-settings] element. -->
	<button class="item" type="button" data-privacy-settings onclick={() => menu.hidePopover()}><Icon name="shield" />Privacy settings</button>
</div>

<style>
	.menu {
		position: fixed;
		inset: auto;
		top: 68px;
		right: max(16px, calc((100vw - 960px) / 2 + 16px));
		margin: 0;
		width: min(280px, calc(100vw - 32px));
		padding: 12px;
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		background: color-mix(in srgb, var(--bg) 92%, transparent);
		color: var(--text);
		box-shadow:
			0 24px 60px -20px rgb(0 0 0 / 0.45),
			inset 0 1px 0 var(--hi);
		backdrop-filter: var(--glass);
		-webkit-backdrop-filter: var(--glass);
	}
	.menu:popover-open {
		display: flex;
		flex-direction: column;
		gap: 4px;
		animation: rise 0.25s var(--ease);
	}
	.label {
		margin: 0 4px 6px;
		font-size: 0.8125rem;
		color: var(--muted);
	}
	.themes {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 4px;
		padding: 4px;
		margin-bottom: 8px;
		border-radius: var(--radius);
		background: var(--surface);
		border: 1px solid var(--border);
	}
	.theme,
	.item {
		font: inherit;
		color: inherit;
		background: none;
		border: 0;
		cursor: pointer;
		display: flex;
		align-items: center;
		gap: 10px;
		min-height: var(--tap);
		border-radius: calc(var(--radius) - 4px);
		text-decoration: none;
	}
	.theme {
		flex-direction: column;
		justify-content: center;
		gap: 2px;
		font-size: 0.8125rem;
		font-weight: 600;
		padding: 6px 0;
	}
	.theme[aria-pressed='true'] {
		background: var(--surface-2);
		box-shadow:
			var(--shadow),
			inset 0 1px 0 var(--hi);
	}
	.item {
		padding: 0 10px;
		font-weight: 600;
	}
	.item:hover,
	.theme:hover {
		background: var(--surface);
	}
	.menu :global(svg) {
		width: 20px;
		height: 20px;
		flex: none;
	}
	@media (prefers-reduced-motion: reduce) {
		.menu:popover-open {
			animation: none;
		}
	}
</style>
