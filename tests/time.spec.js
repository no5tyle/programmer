// The time picker: start and finish boxes, quick choices, and free text (the text is what's stored).
const { test, expect, devices } = require('@playwright/test');
const { openApp, fillCubs } = require('./helpers');

const timeOf = (page, i) => page.evaluate((n) => state.rows[n].time, i);

test.describe('desktop', () => {
  let errors;
  test.beforeEach(async ({ page }) => { errors = await openApp(page); await fillCubs(page); });
  test.afterEach(() => { expect(errors, 'browser errors').toEqual([]); });

  test('pick a start and finish; a new start keeps the length', async ({ page }) => {
    await page.click('#sheet tbody tr:nth-child(1) td.c-time');
    await expect(page.locator('#tStart')).toHaveValue('18:15');
    await expect(page.locator('#tEnd')).toHaveValue('19:45');
    await expect(page.locator('#tLen')).toHaveText('1 h 30 min');
    await page.fill('#tStart', '17:00');
    await expect(page.locator('#tEnd')).toHaveValue('18:30');
    await expect(page.locator('#tText')).toHaveValue('17:00–18:30');
    await page.fill('#tEnd', '19:00');
    await expect(page.locator('#tLen')).toHaveText('2 h');
    await page.click('#tDone');
    await expect(page.locator('#popover')).toBeHidden();
    expect(await timeOf(page, 0)).toBe('17:00–19:00');
    await expect(page.locator('#sheet tbody tr:nth-child(1) td.c-time')).toHaveText('17:00–19:00');
  });

  test('free text is kept as typed, and its times fill the boxes', async ({ page }) => {
    await page.click('#sheet tbody tr:nth-child(2) td.c-time');
    await page.fill('#tText', 'Pick up 9 AM');
    await expect(page.locator('#tStart')).toHaveValue('09:00');
    await expect(page.locator('#tEnd')).toHaveValue('');
    await page.keyboard.press('Enter');
    await expect(page.locator('#popover')).toBeHidden();
    expect(await timeOf(page, 1)).toBe('Pick up 9 AM');
    await expect(page.locator('#sheet tbody tr:nth-child(2) td.c-time')).toHaveText('Pick up 9 AM');
    // Two lines with Shift+Enter
    await page.click('#sheet tbody tr:nth-child(2) td.c-time');
    await page.fill('#tText', '9 AM Sat');
    await page.keyboard.press('Shift+Enter');
    await page.keyboard.type('4 PM Sun');
    await expect(page.locator('#tEnd')).toHaveValue('16:00');
    await page.click('#tDone');
    expect(await timeOf(page, 1)).toBe('9 AM Sat\n4 PM Sun');
  });

  test('quick choices, clear, and the time format and layout', async ({ page }) => {
    await page.click('#sheet tbody tr:nth-child(3) td.c-time');
    await page.click('#popover [data-time="TBA"]');
    await expect(page.locator('#tStart')).toHaveValue('');
    expect(await timeOf(page, 2)).toBe('TBA');
    await page.click('#popover [data-time="meet"]');
    expect(await timeOf(page, 2)).toBe('18:15–19:45');
    await page.click('#tClear');
    expect(await timeOf(page, 2)).toBe('');
    await page.click('#tDone');

    await page.evaluate(() => { state.term.timeFormat = '12'; state.term.timeLayout = 'stacked'; renderAll(); });
    await page.click('#sheet tbody tr:nth-child(3) td.c-time');
    await page.fill('#tStart', '18:00');
    await page.fill('#tEnd', '07:00');
    await expect(page.locator('#tLen')).toHaveText('13 h, finishing the next day');
    await page.click('#tDone');
    expect(await timeOf(page, 2)).toBe('6:00 PM\n7:00 AM');
  });

  test('clicking away keeps the change, and Undo brings back the old time', async ({ page }) => {
    await page.click('#sheet tbody tr:nth-child(1) td.c-time');
    await page.fill('#tStart', '18:30');
    await page.mouse.click(5, 300);
    await expect(page.locator('#popover')).toBeHidden();
    expect(await timeOf(page, 0)).toBe('18:30–20:00');
    await page.click('#btnUndo');
    expect(await timeOf(page, 0)).toBe('18:15–19:45');
  });
});

test.describe('phone', () => {
  const { defaultBrowserType, ...iPhone } = devices['iPhone 13'];
  test.use(iPhone);

  test('time pickers and free text in the editor', async ({ page }) => {
    const errors = await openApp(page);
    await fillCubs(page);
    await page.click('.m-row:has-text("Night Walk")');
    const panel = page.locator('.m-panel:not([hidden])');
    await expect(panel.locator('[data-tm="start"]')).toHaveValue('18:15');
    await expect(panel.locator('[data-chips="time"] .m-chip.on')).toHaveText('Meeting night');
    await panel.locator('[data-tm="start"]').fill('17:00');
    await expect(panel.locator('[data-f="time"]')).toHaveValue('17:00–18:30');
    await expect(panel.locator('[data-chips="time"] .m-chip.on')).toHaveCount(0);
    await panel.locator('[data-chips="time"] .m-chip[data-v="TBA"]').click();
    await expect(panel.locator('[data-tm="start"]')).toHaveValue('');
    await panel.locator('[data-f="time"]').fill('Pick up 9 AM');
    await expect(panel.locator('[data-tm="start"]')).toHaveValue('09:00');
    await panel.locator('[data-panel-done]').click();
    expect(await timeOf(page, 0)).toBe('Pick up 9 AM');
    await expect(page.locator('.m-row:has-text("Night Walk")')).toContainText('Pick up 9 AM');
    expect(errors).toEqual([]);
  });
});
