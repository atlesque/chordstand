<script lang="ts">
	import Icon from './Icon.svelte';
	import { applyTheme, prefs, savePrefs, type Theme } from '$lib/state/app.svelte';

	const ORDER: Theme[] = ['system', 'light', 'dark'];
	const NAMES: Record<Theme, string> = { system: 'System theme', light: 'Light theme', dark: 'Dark theme' };
	const ICONS: Record<Theme, string> = { system: 'auto', light: 'sun', dark: 'moon' };

	function cycle() {
		prefs.theme = ORDER[(ORDER.indexOf(prefs.theme) + 1) % ORDER.length];
		applyTheme(prefs.theme);
		savePrefs();
	}
</script>

<button class="btn icon ghost" type="button" onclick={cycle} aria-label="{NAMES[prefs.theme]}. Change theme" title={NAMES[prefs.theme]}>
	<Icon name={ICONS[prefs.theme]} />
</button>
