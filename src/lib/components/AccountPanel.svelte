<script lang="ts">
	import { onMount } from 'svelte';
	import Icon from './Icon.svelte';
	import { PLAY_URL, account, onPulled, signIn, signOut, start, sync } from '$lib/sync/account.svelte';

	// Loaded lazily by the library page, so the account code never weighs on the first load.

	let { onsync }: { onsync: () => void } = $props();
	let now = $state(Date.now());

	onMount(() => {
		start();
		const tick = setInterval(() => (now = Date.now()), 30_000);
		const off = onPulled(onsync);
		return () => {
			clearInterval(tick);
			off();
		};
	});

	function ago(t: number): string {
		const min = Math.round((now - t) / 60000);
		return min < 1 ? 'just now' : min < 60 ? `${min} min ago` : new Date(t).toLocaleString();
	}

	async function syncNow() {
		await sync(true);
		now = Date.now();
	}
</script>

<section class="account" aria-labelledby="account-title">
	<h2 id="account-title" class="small-title display">Sync</h2>
	{#if account.email}
		<p class="muted small">
			Signed in as <strong>{account.email}</strong> with your <a href={PLAY_URL} target="_blank" rel="noopener">Atlesque account</a>.
			{account.busy ? 'Syncing…' : account.syncedAt ? `Synced ${ago(account.syncedAt)}.` : ''}
		</p>
	{:else}
		<p class="muted small">
			Sign in with your Atlesque account to keep your songs on every device. No password: you get a sign-in link by email. Songs are
			always saved in this browser too.
		</p>
	{/if}
	{#if account.error}
		<p class="notice warn small" role="status">{account.error}</p>
	{/if}
	<div class="row">
		{#if account.email}
			<button class="btn" type="button" onclick={syncNow} disabled={account.busy}><Icon name="refresh" />Sync now</button>
			<button class="btn ghost" type="button" onclick={signOut}>Sign out</button>
		{:else}
			<button class="btn" type="button" onclick={signIn}>Sign in with Atlesque</button>
		{/if}
	</div>
</section>

<style>
	.account {
		margin-top: 32px;
		padding-top: 16px;
		border-top: 1px solid var(--border);
	}
	.small-title {
		font-size: 1.25rem;
	}
	.small {
		font-size: 0.875rem;
	}
	.row {
		display: flex;
		gap: 8px;
		flex-wrap: wrap;
	}
	strong {
		color: var(--text);
		overflow-wrap: anywhere;
	}
</style>
