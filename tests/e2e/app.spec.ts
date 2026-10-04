import { createSong, expect, expectAccessible, test } from './fixtures';

test('first song in three taps @a11y', async ({ page }) => {
	await page.goto('/');
	await expect(page.getByRole('heading', { name: 'Your first song is three taps away' })).toBeVisible();
	await expectAccessible(page);

	await page.getByRole('link', { name: 'Create a song' }).click();
	await expect(page.getByRole('heading', { name: 'New song' })).toBeVisible();
	await expect(page.getByRole('radio', { name: 'Pop', exact: true })).toBeChecked();
	await expectAccessible(page);

	await page.getByRole('button', { name: 'Generate' }).click();
	await expect(page.locator('[data-section-index]')).toHaveCount(6);
	await expect(page.locator('h3')).toHaveText([/Verse/, /Chorus/, /Verse/, /Chorus/, /Bridge/, /Chorus/]);
	await expectAccessible(page);
});

test('generation is deterministic per seed', async ({ page }) => {
	await createSong(page, '1234');
	const first = await page.locator('.bars').first().innerText();
	await createSong(page, '1234');
	expect(await page.locator('.bars').first().innerText()).toBe(first);
});

test('reorder with buttons, undo, redo and announcements', async ({ page }) => {
	await createSong(page);
	await page.getByRole('button', { name: 'Move Verse down' }).first().click();
	await expect(page.locator('h3').first()).toHaveText(/Chorus/);
	await expect(page.locator('[aria-live="polite"]').first()).toHaveText('Verse moved to position 2 of 6');
	await page.getByRole('button', { name: 'Undo' }).click();
	await expect(page.locator('h3').first()).toHaveText(/Verse/);
	await page.getByRole('button', { name: 'Redo' }).click();
	await expect(page.locator('h3').first()).toHaveText(/Chorus/);
});

test('drag to reorder', async ({ page }) => {
	await createSong(page);
	const handle = page.locator('[data-section-index="0"] .handle');
	const target = page.locator('[data-section-index="2"]');
	const hb = (await handle.boundingBox())!;
	const tb = (await target.boundingBox())!;
	await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
	await page.mouse.down();
	for (let i = 1; i <= 10; i++) {
		await page.mouse.move(hb.x + hb.width / 2, hb.y + ((tb.y + tb.height / 2 - hb.y) * i) / 10, { steps: 2 });
	}
	await page.mouse.up();
	await expect(page.locator('h3')).toHaveText([/Chorus/, /Verse/, /Verse/, /Chorus/, /Bridge/, /Chorus/]);
	// One drag = one undo step.
	await page.getByRole('button', { name: 'Undo' }).click();
	await expect(page.locator('h3')).toHaveText([/Verse/, /Chorus/, /Verse/, /Chorus/, /Bridge/, /Chorus/]);
});

test('duplicate, delete with undo, extend', async ({ page }) => {
	await createSong(page);
	await page.getByRole('button', { name: 'Bridge options' }).click();
	await page.getByRole('button', { name: 'Duplicate' }).click();
	await expect(page.locator('[data-section-index]')).toHaveCount(7);

	await page.getByRole('button', { name: 'Delete' }).click();
	await expect(page.locator('[data-section-index]')).toHaveCount(6);
	await page.getByRole('button', { name: 'Undo' }).first().click();
	await expect(page.locator('[data-section-index]')).toHaveCount(7);

	await page.getByRole('button', { name: 'Key change up' }).click();
	await expect(page.locator('[data-section-index]').last()).toContainText('key +1');
	await page.getByRole('button', { name: 'Add section' }).click();
	await expect(page.locator('[data-section-index]')).toHaveCount(9);
});

test('simplify and embellish a chord, a section and the song', async ({ page }) => {
	await createSong(page);
	const firstChord = page.locator('.bars').first().getByRole('button').first();
	const before = await firstChord.innerText();

	await firstChord.click();
	const sheet = page.getByRole('dialog');
	await expect(sheet).toBeVisible();
	await sheet.getByRole('button', { name: 'Embellish This chord' }).click();
	await expect(sheet.getByText('Level 2 of 5')).toBeVisible();
	await expect(firstChord).not.toHaveText(before);
	await sheet.getByRole('button', { name: 'Simplify This chord' }).click();
	await expect(firstChord).toHaveText(before);
	await page.keyboard.press('Escape');
	await expect(sheet).toBeHidden();
	await expect(firstChord).toBeFocused();

	const song = page.getByRole('group', { name: 'Whole song' });
	await song.getByRole('button', { name: 'Embellish Whole song' }).click();
	await expect(song).toContainText('Level 2 of 5');
	await song.getByRole('button', { name: 'Simplify Whole song' }).click();
	await expect(firstChord).toHaveText(before);
});

test('autosaves and survives a reload', async ({ page }) => {
	await createSong(page);
	await page.getByLabel('Song title').fill('Sunday practice');
	await page.getByLabel('Song title').press('Enter');
	await page.getByRole('button', { name: 'Move Verse down' }).first().click();
	await page.waitForTimeout(700);
	await page.reload();
	await expect(page.getByLabel('Song title')).toHaveValue('Sunday practice');
	await expect(page.locator('h3').first()).toHaveText(/Chorus/);
	await page.goto('/');
	await expect(page.getByRole('link', { name: /Sunday practice/ })).toBeVisible();
});

test('library: rename, duplicate, delete with confirm @a11y', async ({ page }) => {
	await createSong(page);
	await page.goto('/');
	await page.getByRole('button', { name: /More actions for/ }).click();
	await expectAccessible(page);
	await page.getByRole('button', { name: 'Duplicate' }).click();
	await expect(page.locator('.song')).toHaveCount(2);
	await page.getByRole('button', { name: /More actions for .*\(copy\)/ }).click();
	await page.getByRole('button', { name: 'Delete' }).first().click();
	const dialog = page.getByRole('dialog', { name: 'Delete this song?' });
	await expect(dialog).toBeVisible();
	await expectAccessible(page);
	await dialog.getByRole('button', { name: 'Delete' }).click();
	await expect(page.locator('.song')).toHaveCount(1);
});

test('play view: large chords, tap and keys move between sections @a11y', async ({ page }) => {
	await createSong(page);
	await page.getByRole('link', { name: 'Play' }).click();
	await expect(page).toHaveURL(/\/play$/);
	await expect(page.getByText('Verse, section 1 of 6')).toBeVisible();
	const size = await page.locator('.chord').first().evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
	expect(size).toBeGreaterThanOrEqual(32);
	await expectAccessible(page);

	await page.getByRole('button', { name: 'Next section' }).click();
	await expect(page.getByText('Chorus, section 2 of 6')).toBeVisible();
	await page.keyboard.press('ArrowRight');
	await expect(page.getByText('Verse, section 3 of 6')).toBeVisible();
	const vw = page.viewportSize()!.width;
	await page.mouse.click(vw * 0.2, 400);
	await expect(page.getByText('Chorus, section 2 of 6')).toBeVisible();
	await page.mouse.click(vw * 0.8, 400);
	await expect(page.getByText('Verse, section 3 of 6')).toBeVisible();
});

test('share link opens and saves to the library', async ({ page, context }) => {
	await context.grantPermissions(['clipboard-read', 'clipboard-write']);
	await createSong(page);
	await page.evaluate(() => {
		// Force the clipboard path (Pixel emulation may expose navigator.share).
		Object.defineProperty(navigator, 'share', { value: undefined });
	});
	await page.getByRole('button', { name: 'Share link' }).click();
	await expect(page.getByText('Share link copied')).toBeVisible();
	const url = await page.evaluate(() => navigator.clipboard.readText());
	expect(url).toMatch(/\/s#[zj]/);

	await page.goto('/');
	await page.evaluate(() => localStorage.clear());
	await page.goto(url);
	await expect(page.getByRole('button', { name: 'Save to my library' })).toBeVisible();
	await expect(page.locator('.section')).toHaveCount(6);
	await page.getByRole('button', { name: 'Save to my library' }).click();
	await expect(page).toHaveURL(/\/song\/[\w-]+$/);
	await page.goto('/');
	await expect(page.locator('.song')).toHaveCount(1);
});

test('export and import a library file', async ({ page }) => {
	await createSong(page);
	await page.goto('/');
	const download = page.waitForEvent('download');
	await page.getByRole('button', { name: 'Export all' }).click();
	const file = await (await download).path();
	await page.evaluate(() => localStorage.clear());
	await page.reload();
	await expect(page.locator('.song')).toHaveCount(0);
	await page.locator('input[type=file]').setInputFiles(file!);
	await expect(page.locator('.song')).toHaveCount(1);
});

test('works offline after the first visit', async ({ page, context }) => {
	await page.goto('/');
	await page.evaluate(() => navigator.serviceWorker.ready);
	await page.reload();
	await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
	await context.setOffline(true);
	await page.goto('/new');
	await expect(page.getByRole('heading', { name: 'New song' })).toBeVisible();
	await page.getByRole('button', { name: 'Generate' }).click();
	await expect(page.locator('[data-section-index]')).toHaveCount(6);
	await context.setOffline(false);
});
