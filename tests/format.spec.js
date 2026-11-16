// Text formatting in free-text fields: the toolbar that hovers above the field (js/rich.js).
const { test, expect, devices } = require('@playwright/test');
const { openApp, fillCubs } = require('./helpers');

const row0 = (page) => page.evaluate(() => ({ description: state.rows[0].description, rich: state.rows[0].rich || {} }));
const cell = '#sheet tbody tr:nth-child(1) td.c-description .ed';

async function typeAndSelectLast(page, selector, text, n) {
  await page.click(selector);
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.type(text);
  for (let i = 0; i < n; i++) await page.keyboard.press('Shift+ArrowLeft');
}

test.describe('desktop', () => {
  let errors;
  test.beforeEach(async ({ page }) => { errors = await openApp(page); await fillCubs(page); });
  test.afterEach(() => { expect(errors, 'browser errors').toEqual([]); });

  test('the toolbar hovers above the field while editing, and formats the selection', async ({ page }) => {
    await expect(page.locator('.fmt-bar')).toBeHidden();
    await typeAndSelectLast(page, cell, 'Bring a torch', 5);
    const bar = page.locator('.fmt-bar');
    await expect(bar).toBeVisible();
    const b = await bar.boundingBox();
    const c = await page.locator(cell).boundingBox();
    expect(b.y + b.height).toBeLessThanOrEqual(c.y + 1);

    await bar.locator('[data-fmt="bold"]').click();
    await expect(bar.locator('[data-fmt="bold"]')).toHaveAttribute('aria-pressed', 'true');
    expect(await row0(page)).toEqual({ description: 'Bring a torch', rich: { description: 'Bring a <b>torch</b>' } });
    await expect(page.locator(`${cell} b`)).toHaveText('torch');

    await bar.locator('[data-fmt="italic"]').click();
    await bar.locator('[data-fmt="underline"]').click();
    await bar.locator('[data-fmt="red"]').click();
    let r = await row0(page);
    expect(r.description).toBe('Bring a torch');
    expect(r.rich.description).toMatch(/class="r"/);
    expect(r.rich.description).toMatch(/<b>/);
    expect(r.rich.description).toMatch(/<i>/);
    expect(r.rich.description).toMatch(/<u>/);
    // While editing, the cell has the browser's own red; drawn again, the saved form
    await expect(page.locator(`${cell} font`)).toHaveCSS('color', 'rgb(208, 2, 27)');
    await page.mouse.click(5, 300);
    await page.evaluate(() => renderAll());
    await expect(page.locator(`${cell} .r`)).toHaveCSS('color', 'rgb(208, 2, 27)');
    await typeAndSelectLast(page, cell, 'Bring a torch', 5);
    await bar.locator('[data-fmt="bold"]').click();

    await page.keyboard.press('ControlOrMeta+A');
    await bar.locator('[data-fmt="clear"]').click();
    r = await row0(page);
    expect(r).toEqual({ description: 'Bring a torch', rich: {} });

    // Leaving the field hides it
    await page.mouse.click(5, 300);
    await expect(bar).toBeHidden();
  });

  test('keyboard shortcuts, line breaks, and plain-text paste', async ({ page }) => {
    await typeAndSelectLast(page, cell, 'Walk', 4);
    await page.keyboard.press('ControlOrMeta+B');
    await page.keyboard.press('End');
    // Typing on from bold text stays bold until it's turned off, as in any editor
    await page.keyboard.press('ControlOrMeta+B');
    await page.keyboard.press('Enter');
    await page.keyboard.type('Bring water');
    let r = await row0(page);
    expect(r.description).toBe('Walk\nBring water');
    // (the line break may land just inside or outside the bold: it looks the same)
    expect(r.rich.description).toMatch(/^<b>Walk(<br>|\n)?<\/b>(<br>|\n)?Bring water$/);
    // Pasted text comes in plain
    await page.evaluate(() => {
      const dt = new DataTransfer();
      dt.setData('text/html', '<b style="color:red">Loud</b>');
      dt.setData('text/plain', ' Loud');
      document.activeElement.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
    });
    r = await row0(page);
    expect(r.description).toBe('Walk\nBring water Loud');
    expect(r.rich.description).not.toMatch(/class="r"/);
  });

  test('formatting is saved, comes back after a reload, and stays out of the calendar and spreadsheet', async ({ page }) => {
    await typeAndSelectLast(page, cell, 'Bring a torch', 5);
    await page.click('.fmt-bar [data-fmt="bold"]');
    await page.mouse.click(5, 300);
    await page.waitForTimeout(600);
    await page.reload();
    await page.waitForFunction(() => typeof state === 'object');
    await expect(page.locator(`${cell} b`)).toHaveText('torch');
    const out = await page.evaluate(() => {
      const grab = (fn) => { let text = ''; const real = downloadFile; downloadFile = (n, t) => { text = t; }; fn(); downloadFile = real; return text; };
      return [grab(exportCalendar), grab(exportCsv)];
    });
    expect(out[0]).toContain('Bring a torch');
    expect(out[1]).toContain('Bring a torch');
    expect(out.join('')).not.toMatch(/<b>/);
  });

  test('formatting from a file is cleaned, and dropped if the text has changed since', async ({ page }) => {
    const r = await page.evaluate(() => {
      const s = normalise({ rows: [
        { date: '2026-10-13', activity: 'Hike', description: 'Hi there', rich: { description: '<img src=x onerror="window.hacked=1"><b onclick="x()">Hi</b> <a href="javascript:x()">there</a><script>window.hacked=1</script>' } },
        { date: '2026-10-20', activity: 'Knots', description: 'Changed in a spreadsheet', rich: { description: '<b>Old text</b>' } },
      ] });
      state = s; renderAll();
      return [s.rows[0].rich, document.querySelector('#sheet tbody tr:nth-child(1) td.c-description .ed').innerHTML,
        document.querySelector('#sheet tbody tr:nth-child(2) td.c-description .ed').innerHTML, window.hacked];
    });
    expect(r[0]).toEqual({ description: '<b>Hi</b> there' });
    expect(r[1]).toBe('<b>Hi</b> there');
    expect(r[2]).toBe('Changed in a spreadsheet');
    expect(r[3]).toBeUndefined();
  });

  test('week-off text can be formatted too, and the PDF capture leaves the toolbar out', async ({ page }) => {
    await page.evaluate(() => { state.rows[3].noMeeting = true; state.rows[3].activity = 'No Cubs this week'; renderAll(); });
    const off = '#sheet tbody tr:nth-child(4) td.c-break .ed';
    await typeAndSelectLast(page, off, 'No Cubs – Show Day', 8);
    await page.click('.fmt-bar [data-fmt="red"]');
    expect(await page.evaluate(() => state.rows[3].rich.activity)).toBe('No Cubs – <span class="r">Show Day</span>');
    await expect(page.locator('#sheet .fmt-bar')).toHaveCount(0);
  });
});

test.describe('phone', () => {
  const { defaultBrowserType, ...iPhone } = devices['iPhone 13'];
  test.use(iPhone);

  test('the editor fields have the toolbar too', async ({ page }) => {
    const errors = await openApp(page);
    await fillCubs(page);
    await page.click('.m-row:has-text("Night Walk")');
    const field = '.m-panel:not([hidden]) [data-f="description"]';
    await typeAndSelectLast(page, field, 'Bring a torch', 5);
    const bar = page.locator('.fmt-bar');
    await expect(bar).toBeVisible();
    const b = await bar.boundingBox();
    expect(b.x).toBeGreaterThanOrEqual(0);
    expect(b.x + b.width).toBeLessThanOrEqual(390);
    await bar.locator('[data-fmt="bold"]').tap();
    await page.click('.m-panel:not([hidden]) [data-panel-done]');
    const r = await row0(page);
    expect(r).toEqual({ description: 'Bring a torch', rich: { description: 'Bring a <b>torch</b>' } });
    await expect(bar).toBeHidden();
    // And the activity name
    await page.click('.m-row:has-text("Night Walk")');
    await expect(page.locator('.m-panel:not([hidden]) [data-f="activity"]')).toHaveText('Night Walk');
    expect(errors).toEqual([]);
  });
});
