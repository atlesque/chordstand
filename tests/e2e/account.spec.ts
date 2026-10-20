import { createSong, expect, expectAccessible, test } from './fixtures';

type Entry = { id: string; at: number; song?: { id: string; title: string } };

// Atlesque Play is mocked: the hosted sign-in page sends the player straight back with a code,
// and the progress API keeps the account's save in memory.
test('sign in with Atlesque Play and sync the library @a11y', async ({ page, context }) => {
	await createSong(page);
	const local = await page.evaluate(() => {
		const index = JSON.parse(localStorage.getItem('chordstand:v1:index')!);
		return JSON.parse(localStorage.getItem(`chordstand:v1:song:${index[0].id}`)!);
	});
	const fromPhone = { ...local, id: 'from-phone', title: 'From my phone' };
	let server = { data: { v: 1, songs: 1, list: [{ id: fromPhone.id, at: Date.now(), song: fromPhone }] } as Record<string, unknown>, rev: 3 };
	const puts: { z?: string; list?: Entry[] }[] = [];
	// Saves go up deflated; inflate them in the page, where DecompressionStream is.
	const decode = (data: { z?: string; list?: Entry[] }) =>
		page.evaluate(async (d): Promise<Entry[]> => {
			if (!d.z) return d.list!;
			const bytes = Uint8Array.from(atob(d.z), (c) => c.charCodeAt(0));
			const out = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
			return JSON.parse(await new Response(out).text());
		}, data);

	await context.route('https://play.atlesque.dev/**', async (route) => {
		const req = route.request();
		const url = new URL(req.url());
		const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, content-type', 'access-control-allow-methods': 'GET, PUT, POST' };
		if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
		if (url.pathname === '/signin') {
			expect(url.searchParams.get('client')).toBe('chordstand');
			const back = new URL(url.searchParams.get('redirect_uri')!);
			back.searchParams.set('mbpg_code', 'code-1');
			back.searchParams.set('mbpg_state', url.searchParams.get('state')!);
			return route.fulfill({ status: 302, headers: { location: back.toString() } });
		}
		if (url.pathname === '/api/token') {
			expect(req.postDataJSON()).toMatchObject({ code: 'code-1', client: 'chordstand' });
			return route.fulfill({ headers: cors, json: { token: 'tok', user: { id: 'u1', email: 'me@example.com' }, expiresAt: 0 } });
		}
		if (url.pathname === '/api/games/chordstand/progress') {
			expect(req.headers().authorization).toBe('Bearer tok');
			if (req.method() === 'GET') return route.fulfill({ headers: cors, json: server });
			const body = req.postDataJSON();
			if (body.rev !== server.rev) return route.fulfill({ status: 409, headers: cors, json: { error: 'conflict', ...server } });
			server = { data: body.data, rev: server.rev + 1 };
			puts.push(body.data);
			return route.fulfill({ headers: cors, json: { rev: server.rev } });
		}
		if (url.pathname === '/api/logout') return route.fulfill({ headers: cors, json: { ok: true } });
		return route.fulfill({ status: 404, headers: cors, json: {} });
	});

	await page.goto('/');
	await expect(page.getByRole('heading', { name: 'Sync' })).toBeVisible();
	await page.getByRole('button', { name: 'Sign in with Atlesque' }).click();

	// Back from Atlesque Play: both devices' songs are here and on the account.
	await expect(page.getByText('Signed in as me@example.com', { exact: false }).first()).toBeVisible();
	await expect(page.getByRole('link', { name: /From my phone/ })).toBeVisible();
	await expect(page.locator('.song')).toHaveCount(2);
	await expect.poll(() => puts.length).toBe(1);
	expect((await decode(puts[0])).filter((e) => e.song).map((e) => e.id).sort()).toEqual([local.id, 'from-phone'].sort());
	expect(server.data.songs).toBe(2);
	expect(new URL(page.url()).search).toBe('');
	await expectAccessible(page);

	// A deletion goes up as a tombstone.
	await page.getByRole('button', { name: 'More actions for From my phone' }).click();
	await page.getByRole('button', { name: 'Delete' }).first().click();
	await page.getByRole('dialog', { name: 'Delete this song?' }).getByRole('button', { name: 'Delete' }).click();
	await page.getByRole('button', { name: 'Sync now' }).click();
	await expect.poll(() => puts.length).toBe(2);
	expect((await decode(puts[1])).find((e) => e.id === 'from-phone')?.song).toBeUndefined();
	expect(server.data.songs).toBe(1);

	// Signing out keeps the songs in this browser.
	await page.getByRole('button', { name: 'Sign out' }).click();
	await expect(page.getByRole('button', { name: 'Sign in with Atlesque' })).toBeVisible();
	await expect(page.locator('.song')).toHaveCount(1);
});
