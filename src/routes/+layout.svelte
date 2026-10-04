<script lang="ts">
	import '../app.css';
	import { onMount } from 'svelte';
	import { applyTheme, dismissToast, live, prefs, requestPersistence, toasts } from '$lib/state/app.svelte';

	let { children } = $props();

	onMount(() => {
		applyTheme(prefs.theme);
		requestPersistence();
		if ('serviceWorker' in navigator && !import.meta.env.DEV) {
			navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {});
		}
	});
</script>

<a class="skip-link" href="#main">Skip to content</a>

{@render children()}

<div class="visually-hidden" aria-live="polite" aria-atomic="true">{live.message}</div>

{#if toasts.current}
	{@const toast = toasts.current}
	<div class="toast" role="status">
		<span>{toast.message}</span>
		{#if toast.action}
			<button
				class="btn ghost"
				type="button"
				onclick={() => {
					toast.action?.run();
					dismissToast();
				}}>{toast.action.label}</button
			>
		{/if}
	</div>
{/if}

<style>
	.toast {
		position: fixed;
		left: 50%;
		transform: translateX(-50%);
		bottom: calc(88px + env(safe-area-inset-bottom, 0px));
		z-index: 50;
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 4px 4px 4px 16px;
		max-width: calc(100vw - 32px);
		background: var(--text);
		color: var(--bg);
		border-radius: var(--radius);
		box-shadow: var(--shadow);
	}
	.toast .btn {
		color: var(--bg);
		text-decoration: underline;
	}
	.toast .btn:hover {
		background: transparent;
	}
</style>
