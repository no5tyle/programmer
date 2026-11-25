// Full screen: no app frame, the program as large as the screen allows, and notes over it.
const { test, expect } = require('@playwright/test');
const { openApp, fillCubs } = require('./helpers');

const rowOf = (name) => `#sheet tbody tr:has(.ed[data-key="activity"]:text-is("${name}"))`;

test.describe('full screen', () => {
  let errors;
  test.beforeEach(async ({ page }) => { errors = await openApp(page); await fillCubs(page); });
  test.afterEach(() => { expect(errors, 'browser errors').toEqual([]); });

  test('hides the app frame and fits the whole program to the screen; Exit and Esc bring it all back', async ({ page }) => {
    await page.click('#btnFull');
    for (const sel of ['.appbar', '#directory', '.ws-toolbar', '#sidebar']) await expect(page.locator(sel)).toBeHidden();
    await expect(page.locator('#fsBar')).toBeVisible();
    const box = await page.locator('#paper').boundingBox();
    const vp = page.viewportSize();
    // Fills the screen one way, and fits it the other
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(vp.width + 1);
    expect(box.y + box.height).toBeLessThanOrEqual(vp.height + 1);
    expect(Math.max(box.width / vp.width, box.height / vp.height)).toBeGreaterThan(0.95);

    // Cells still edit, and Esc closes the cell before it leaves full screen
    await page.click(`${rowOf('Night Walk')} .ed[data-key="activity"]`);
    await page.keyboard.press('Escape');
    await expect(page.locator('#fsBar')).toBeVisible();
    await page.locator('body').press('Escape');
    await expect(page.locator('#fsBar')).toBeHidden();
    await expect(page.locator('.appbar')).toBeVisible();
    await expect(page.locator('#sidebar')).toBeVisible();

    await page.click('#btnFull');
    await page.click('#btnFsExit');
    await expect(page.locator('#directory')).toBeVisible();
    await expect(page.locator('#btnFull')).toBeFocused();
  });

  test('notes open over the program, which keeps its size', async ({ page }) => {
    await page.click('#btnFull');
    const before = await page.locator('#paper').boundingBox();
    await page.click(`${rowOf('Night Walk')} .ed[data-key="activity"]`);
    await page.keyboard.press('Escape');
    await page.click('#btnFsNotes');
    await expect(page.locator('#notesPane')).toBeVisible();
    await expect(page.locator('#btnFsNotes')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#notesRow b')).toHaveText('Night Walk');
    expect(await page.locator('#paper').boundingBox()).toEqual(before);
    await page.fill('#notesLeaders', 'Torches from the store');
    // Esc in the notes leaves the box, not full screen
    await page.keyboard.press('Escape');
    await expect(page.locator('#fsBar')).toBeVisible();
    await page.click('#btnFsNotes');
    await expect(page.locator('#notesPane')).toBeHidden();
    await page.click('#btnFsExit');
    await expect(page.locator('#sidebar')).toBeVisible();
  });
});
