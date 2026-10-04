<script lang="ts">
	import { page } from '$app/state';
	import PlayView from '$lib/components/PlayView.svelte';
	import NotFound from '$lib/components/NotFound.svelte';
	import { repo } from '$lib/state/app.svelte';

	const song = $derived(repo().get(page.params.id ?? ''));
</script>

{#key page.params.id}
	{#if song}
		<PlayView {song} backHref="/song/{song.id}" />
	{:else}
		<NotFound />
	{/if}
{/key}
