// The notes pane: per row, leaders' own notes and details for families, opened in place of the settings.
const { test, expect } = require('@playwright/test');
const { openApp, fillCubs } = require('./helpers');

const rowOf = (name) => `#sheet tbody tr:has(.ed[data-key="activity"]:text-is("${name}"))`;
const rowData = (page, name) => page.evaluate((n) => { const r = state.rows.find((x) => x.activity === n); return { leaderNotes: r.leaderNotes, details: r.details }; }, name);

test.describe('notes', () => {
  let errors;
  test.beforeEach(async ({ page }) => { errors = await openApp(page); await fillCubs(page); });
  test.afterEach(() => { expect(errors, 'browser errors').toEqual([]); });

  test('Notes opens in place of the settings for the row, saves what is typed, and Close brings the settings back', async ({ page }) => {
    await expect(page.locator('#sidebar')).toBeVisible();
    await page.click(`${rowOf('Knots and Pioneering')} .ed[data-key="activity"]`);
    await page.keyboard.press('Escape');
    await page.click('#btnNotes');
    await expect(page.locator('#notesPane')).toBeVisible();
    await expect(page.locator('#sidebar')).toBeHidden();
    await expect(page.locator('#btnNotes')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#notesRow b')).toHaveText('Knots and Pioneering');
    await expect(page.locator(rowOf('Knots and Pioneering'))).toHaveClass(/notes-on/);

    await page.fill('#notesLeaders', 'Baloo brings the rope');
    await page.fill('#notesDetails', 'Bring a water bottle.');
    expect(await rowData(page, 'Knots and Pioneering')).toEqual({ leaderNotes: 'Baloo brings the rope', details: 'Bring a water bottle.' });
    // Kept after a reload
    await page.waitForTimeout(800);
    await page.reload();
    await page.waitForFunction(() => typeof state === 'object');
    expect(await rowData(page, 'Knots and Pioneering')).toEqual({ leaderNotes: 'Baloo brings the rope', details: 'Bring a water bottle.' });

    await page.click(`${rowOf('Knots and Pioneering')} .note-mark`);
    await expect(page.locator('#notesPane')).toBeVisible();
    await expect(page.locator('#notesLeaders')).toHaveValue('Baloo brings the rope');
    await page.click('#btnNotesClose');
    await expect(page.locator('#notesPane')).toBeHidden();
    await expect(page.locator('#sidebar')).toBeVisible();
    await expect(page.locator(rowOf('Knots and Pioneering'))).not.toHaveClass(/notes-on/);
  });

  test('the row menu opens them, the pane follows the row being worked on, and Next and Previous step through', async ({ page }) => {
    await page.hover(`${rowOf('Night Walk')} td.c-description`);
    await page.click('#rowHandle');
    await page.click('#popover [data-act="notes"]');
    await expect(page.locator('#notesRow b')).toHaveText('Night Walk');
    await expect(page.locator('#btnNotesPrev')).toBeDisabled();

    await page.click('#btnNotesNext');
    await expect(page.locator('#notesRow b')).toHaveText('Knots and Pioneering');
    await page.click('#btnNotesPrev');
    await expect(page.locator('#notesRow b')).toHaveText('Night Walk');

    await page.click(`${rowOf('Games at the Block')} .ed[data-key="activity"]`);
    await expect(page.locator('#notesRow b')).toHaveText('Games at the Block');
    await page.keyboard.press('Escape');

    // Settings takes the place back
    await page.click('#btnSettings');
    await expect(page.locator('#notesPane')).toBeHidden();
    await expect(page.locator('#sidebar')).toBeVisible();
  });

  test('a row with notes gets a mark on screen that goes when the notes are cleared, and neither prints', async ({ page }) => {
    await expect(page.locator('#sheet .note-mark')).toHaveCount(0);
    await page.evaluate(() => { state.rows[0].leaderNotes = 'Book the park'; renderAll(); });
    await expect(page.locator('#sheet .note-mark')).toHaveCount(1);
    await page.click('#sheet .note-mark');
    await expect(page.locator('#notesLeaders')).toHaveValue('Book the park');

    await page.emulateMedia({ media: 'print' });
    await expect(page.locator('#notesPane')).toBeHidden();
    await expect(page.locator('#sheet .note-mark')).toBeHidden();
    await expect(page.locator('#sheet')).not.toContainText('Book the park');
    await page.emulateMedia({ media: 'screen' });

    await page.fill('#notesLeaders', '');
    await expect(page.locator('#sheet .note-mark')).toHaveCount(0);
  });

  test('Undo takes back typing in the notes', async ({ page }) => {
    await page.hover(`${rowOf('Night Walk')} td.c-description`);
    await page.click('#rowHandle');
    await page.click('#popover [data-act="notes"]');
    await page.fill('#notesDetails', 'Bring a torch');
    await page.locator('#notesDetails').blur();
    await page.click('#btnUndo');
    expect((await rowData(page, 'Night Walk')).details || '').toBe('');
    await expect(page.locator('#notesDetails')).toHaveValue('');
  });
});
