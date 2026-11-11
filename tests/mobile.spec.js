// The phone and tablet view.
const { test, expect, devices } = require('@playwright/test');
const { openApp, fillCubs } = require('./helpers');

// iPhone screen, touch and user agent, run in Chromium (the WebKit engine isn't needed for these checks).
const { defaultBrowserType, ...iPhone } = devices['iPhone 13'];
test.use({ ...iPhone, browserName: 'chromium' });

test.describe('phone', () => {
  let errors;
  test.beforeEach(async ({ page }) => { errors = await openApp(page); });
  test.afterEach(() => { expect(errors, 'browser errors').toEqual([]); });

  test('uses the mobile view with a short list', async ({ page }) => {
    await fillCubs(page);
    expect(await page.evaluate(() => document.body.classList.contains('mobile'))).toBe(true);
    await expect(page.locator('.m-row')).toHaveCount(9);
  });

  test('editing an activity in the editor', async ({ page }) => {
    await fillCubs(page);
    await page.click('.m-row:has-text("OAS Catchup")');
    await page.fill('[data-f="activity"]', 'OAS Catchup & Investiture');
    await page.click('[data-chips="patrol"] .m-chip[data-v="Green"]');
    await page.click('[data-chips="leader"] .m-chip[data-v="Misia"]');
    await page.click('.days .day:has(b:text-is("Wed"))');
    await page.click('[data-red="activity"]');
    await page.click('.m-panel:not([hidden]) [data-panel-done]');
    const r = await page.evaluate(() => { const x = state.rows.find((y) => y.activity.startsWith('OAS')); return [x.date, x.activity, x.patrol, x.leader, x.red]; });
    expect(r).toEqual(['2026-10-28', 'OAS Catchup & Investiture', 'Green', 'Misia', ['activity']]);
  });

  test('settings screens use the same controls', async ({ page }) => {
    await page.click('#mMenu');
    await page.click('.m-item:has-text("Branding")');
    await page.fill('.m-panel:not([hidden]) [data-bind="branding.groupName"]', '1st Example Scout Group');
    await page.click('.m-panel:not([hidden]) [data-panel-done]');
    expect(await page.evaluate(() => state.branding.groupName)).toBe('1st Example Scout Group');
    await expect(page.locator('#sidebar [data-bind="branding.groupName"]')).toHaveCount(1);   // moved back
  });

  test('Share offers the PDF and no browser print on iPhone', async ({ page }) => {
    await page.click('#mShare');
    const items = await page.locator('[data-share]').evaluateAll((bs) => bs.map((b) => b.dataset.share));
    expect(items).toEqual(['pdf', 'ics', 'csv', 'json']);
  });

  test('Print on iPhone hands over the app-made PDF', async ({ page }) => {
    const res = await page.evaluate(async () => {
      window.open = () => ({ document: { write() {} }, location: { set href(v) { window.opened = v; } }, close() {} });
      printProgram();
      for (let i = 0; i < 150 && !window.opened; i++) await new Promise((r) => setTimeout(r, 200));
      const blob = await fetch(window.opened).then((r) => r.blob());
      return [blob.type, new TextDecoder().decode(await blob.slice(0, 5).arrayBuffer())];
    });
    expect(res).toEqual(['application/pdf', '%PDF-']);
  });
});
