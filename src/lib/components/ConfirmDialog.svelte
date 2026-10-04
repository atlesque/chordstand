<script lang="ts">
	// The only modal in the app: confirming a destructive delete.
	let {
		title,
		message,
		confirmLabel = 'Delete',
		onconfirm,
		oncancel
	}: { title: string; message: string; confirmLabel?: string; onconfirm: () => void; oncancel: () => void } = $props();

	let dialog: HTMLDialogElement;
	$effect(() => {
		dialog.showModal();
		return () => dialog.open && dialog.close();
	});
</script>

<dialog bind:this={dialog} aria-labelledby="confirm-title" aria-describedby="confirm-message" oncancel={(e) => { e.preventDefault(); oncancel(); }}>
	<h2 id="confirm-title">{title}</h2>
	<p id="confirm-message">{message}</p>
	<div class="row">
		<button class="btn" type="button" onclick={oncancel}>Cancel</button>
		<button class="btn primary danger-fill" type="button" onclick={onconfirm}>{confirmLabel}</button>
	</div>
</dialog>

<style>
	dialog {
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		background: color-mix(in srgb, var(--bg) 88%, transparent);
		color: var(--text);
		padding: 24px;
		width: min(420px, calc(100vw - 32px));
		box-shadow:
			0 32px 80px -24px rgb(0 0 0 / 0.5),
			inset 0 1px 0 var(--hi);
		backdrop-filter: var(--glass);
		-webkit-backdrop-filter: var(--glass);
		animation: dialog-in 0.4s var(--spring);
	}
	@keyframes dialog-in {
		from {
			opacity: 0;
			transform: translateY(12px) scale(0.94);
		}
	}
	dialog::backdrop {
		background: rgb(10 8 20 / 0.45);
		backdrop-filter: blur(6px);
		-webkit-backdrop-filter: blur(6px);
	}
	h2 {
		font-family: var(--display);
		font-size: 1.5rem;
	}
	p {
		margin: 8px 0 20px;
	}
	.row {
		display: flex;
		justify-content: flex-end;
		gap: 8px;
	}
	.danger-fill {
		background: var(--danger);
		border-color: var(--danger);
		color: var(--bg);
		box-shadow: none;
	}
</style>
