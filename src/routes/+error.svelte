<script lang="ts">
	import { page } from '$app/state';
	import NotFound from '$lib/components/NotFound.svelte';
</script>

<NotFound title={page.status === 404 ? 'Page not found' : 'Something went wrong'} message={page.status === 404 ? "There's nothing at this address." : 'Something went wrong. Your songs are safe in this browser.'} />
