<script lang="ts">
	import '../app.css';
	import { onMount } from 'svelte';
	import { onNavigate } from '$app/navigation';
	import { applyTheme, dismissToast, live, prefs, requestPersistence, toasts } from '$lib/state/app.svelte';

	let { children } = $props();

	// Cross-fade between pages where the browser supports view transitions.
	onNavigate((nav) => {
		if (!document.startViewTransition || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
		return new Promise((resolve) => {
			document.startViewTransition(async () => {
				resolve();
				await nav.complete;
			});
		});
	});

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
		translate: -50% 0;
		bottom: calc(88px + env(safe-area-inset-bottom, 0px));
		z-index: 50;
		display: flex;
		align-items: center;
		gap: 8px;
		min-height: 48px;
		padding: 4px 4px 4px 20px;
		max-width: calc(100vw - 32px);
		background: color-mix(in srgb, var(--text) 90%, transparent);
		color: var(--bg);
		border-radius: 999px;
		box-shadow: 0 16px 40px -12px rgb(0 0 0 / 0.45);
		backdrop-filter: var(--glass);
		-webkit-backdrop-filter: var(--glass);
		animation: toast-in 0.45s var(--spring) backwards;
	}
	@keyframes toast-in {
		from {
			opacity: 0;
			transform: translateY(16px) scale(0.92);
		}
	}
	.toast .btn {
		border-radius: 999px;
		color: var(--bg);
		text-decoration: underline;
	}
	.toast .btn:hover {
		background: transparent;
	}
</style>
