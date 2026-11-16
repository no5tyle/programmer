// Password managers and autofill are told to leave every text field alone (none is personal details).
const { test, expect, devices } = require('@playwright/test');
const { openApp, fillCubs } = require('./helpers');

const TEXT_FIELDS = 'input:not([type=checkbox]):not([type=radio]):not([type=color]):not([type=file]):not([type=hidden]):not([type=range]), textarea';
const unmarked = (page) => page.evaluate((sel) => [...document.querySelectorAll(sel)]
  .filter((el) => el.getAttribute('data-lpignore') !== 'true' || el.getAttribute('autocomplete') !== 'off' || !el.hasAttribute('data-1p-ignore'))
  .map((el) => el.outerHTML.slice(0, 120)), TEXT_FIELDS);

test('every text field on the desktop, including ones added later', async ({ page }) => {
  await openApp(page);
  await fillCubs(page);
  expect(await page.locator('[data-bind="branding.titleTemplate"]').getAttribute('data-lpignore')).toBe('true');
  expect(await unmarked(page)).toEqual([]);
  await page.click('details.card:has-text("Leaders") summary');
  await page.click('[data-add="leaders"]');
  await page.click('#sheet tbody tr:nth-child(1) td.c-date');
  expect(await unmarked(page)).toEqual([]);
  await page.keyboard.press('Escape');
  await page.click('#sheet tbody tr:nth-child(1) td.c-time');
  expect(await page.locator('#tText').getAttribute('data-lpignore')).toBe('true');
  expect(await unmarked(page)).toEqual([]);
});

test('the setup wizard', async ({ page }) => {
  await page.goto('/');
  await page.fill('#wzGroup', '1st Example Scout Group');
  expect(await unmarked(page)).toEqual([]);
  await page.click('[data-wz="next"]'); await page.click('[data-wz="next"]'); await page.click('[data-wz="next"]');
  await page.click('#wzAddLeader');
  expect(await unmarked(page)).toEqual([]);
});

test.describe('phone', () => {
  const { defaultBrowserType, ...iPhone } = devices['iPhone 13'];
  test.use(iPhone);
  test('the editor and settings panels', async ({ page }) => {
    await openApp(page);
    await fillCubs(page);
    await page.click('.m-row:has-text("Night Walk")');
    expect(await unmarked(page)).toEqual([]);
    await page.click('.m-panel:not([hidden]) [data-panel-done]');
    await page.click('#mMenu');
    await page.click('[data-card="1"]');
    expect(await unmarked(page)).toEqual([]);
  });
});
