<script lang="ts">
	let {
		title = 'Song not found',
		message = "This song isn't in this browser's library. It may have been deleted, or saved on another device."
	}: { title?: string; message?: string } = $props();
</script>

<svelte:head><title>{title} · Chordstand</title></svelte:head>

<main id="main" class="page nf">
	<h1>{title}</h1>
	<p class="muted">{message}</p>
	<a class="btn primary" href="/">Go to your songs</a>
</main>

<style>
	.nf {
		text-align: center;
		padding-top: 64px;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 12px;
	}
	p {
		max-width: 32em;
		margin: 0;
	}
</style>
