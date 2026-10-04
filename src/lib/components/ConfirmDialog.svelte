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
		border-radius: 16px;
		background: var(--bg);
		color: var(--text);
		padding: 20px;
		width: min(420px, calc(100vw - 32px));
	}
	dialog::backdrop {
		background: rgb(0 0 0 / 0.5);
	}
	h2 {
		font-size: 1.25rem;
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
	}
</style>
