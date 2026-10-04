<script lang="ts">
	import { page } from '$app/state';
	import SongEditor from '$lib/components/SongEditor.svelte';
	import NotFound from '$lib/components/NotFound.svelte';
	import { repo } from '$lib/state/app.svelte';

	const song = $derived(repo().get(page.params.id ?? ''));
</script>

{#key page.params.id}
	{#if song}
		<SongEditor {song} />
	{:else}
		<NotFound />
	{/if}
{/key}
