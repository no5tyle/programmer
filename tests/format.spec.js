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
    await expect(page.locator('.fmt-bar:not(.fs-bar)')).toBeHidden();
    await typeAndSelectLast(page, cell, 'Bring a torch', 5);
    const bar = page.locator('.fmt-bar:not(.fs-bar)');
    await expect(bar).toBeVisible();
    const b = await bar.boundingBox();
    // Placed as the style toolbar is for picked cells: 6px above the table cell, lined up with its left edge
    const c = await page.locator(cell).locator('xpath=..').boundingBox();
    expect(Math.abs(b.x - c.x)).toBeLessThan(1);
    expect(Math.abs(c.y - (b.y + b.height) - 6)).toBeLessThan(1);
    await page.mouse.click(5, 300);
    await page.click('#sheet tbody tr:nth-child(1) td.c-patrol');
    const fb = await page.locator('.fs-bar').boundingBox();
    const pc = await page.locator('#sheet tbody tr:nth-child(1) td.c-patrol').boundingBox();
    expect(Math.abs(pc.y - (fb.y + fb.height) - 6)).toBeLessThan(1);
    await page.mouse.click(5, 300);
    await typeAndSelectLast(page, cell, 'Bring a torch', 5);

    await bar.locator('[data-fmt="bold"]').click();
    await expect(bar.locator('[data-fmt="bold"]')).toHaveAttribute('aria-pressed', 'true');
    expect(await row0(page)).toEqual({ description: 'Bring a torch', rich: { description: 'Bring a <b>torch</b>' } });
    await expect(page.locator(`${cell} b`)).toHaveText('torch');

    await bar.locator('[data-fmt="italic"]').click();
    await bar.locator('[data-fmt="underline"]').click();
    await bar.locator('[data-colour="#d0021b"]').click();
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
    await page.click('.fmt-bar:not(.fs-bar) [data-fmt="bold"]');
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
    await page.click('.fmt-bar:not(.fs-bar) [data-colour="#d0021b"]');
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
    const bar = page.locator('.fmt-bar:not(.fs-bar)');
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

test.describe('whole-field styles on other fields', () => {
  let errors;
  test.beforeEach(async ({ page }) => { errors = await openApp(page); await fillCubs(page); });
  test.afterEach(() => { expect(errors, 'browser errors').toEqual([]); });

  test('the group name and heading note take bold, italic and a colour from a toolbar above them', async ({ page }) => {
    await page.click('[data-bind="branding.groupName"]');
    const bar = page.locator('.fs-bar');
    await expect(bar).toBeVisible();
    await expect(page.locator('.fmt-bar:not(.fs-bar)')).toBeHidden();
    const b = await bar.boundingBox();
    const f = await page.locator('[data-bind="branding.groupName"]').boundingBox();
    expect(b.y + b.height).toBeLessThanOrEqual(f.y + 1);

    // The group name prints bold, so Bold shows as on (and the field shows it bold)
    await expect(bar.locator('[data-fs-act="b"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(bar.locator('[data-fs-act="i"]')).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('[data-bind="branding.groupName"]')).toHaveCSS('font-weight', '700');
    await bar.locator('[data-fs-act="b"]').click();
    expect(await page.evaluate(() => state.styles['branding.groupName'])).toEqual({ b: false });
    await expect(page.locator('#sheet .doc-group')).toHaveCSS('font-weight', '400');
    await expect(bar.locator('[data-fs-act="b"]')).toHaveAttribute('aria-pressed', 'false');
    await bar.locator('[data-fs-act="b"]').click();
    expect(await page.evaluate(() => state.styles['branding.groupName'])).toBeUndefined();
    await expect(page.locator('#sheet .doc-group')).toHaveCSS('font-weight', '800');

    await bar.locator('[data-fs-colour="#0060df"]').click();
    await bar.locator('[data-fs-act="i"]').click();
    expect(await page.evaluate(() => state.styles['branding.groupName'])).toEqual({ c: '#0060df', i: true });
    await expect(page.locator('#sheet .doc-group')).toHaveCSS('color', 'rgb(0, 96, 223)');
    await expect(page.locator('#sheet .doc-group')).toHaveCSS('font-style', 'italic');
    // The field shows it too, and keeps the focus
    await expect(page.locator('[data-bind="branding.groupName"]')).toHaveCSS('color', 'rgb(0, 96, 223)');
    await expect(page.locator('[data-bind="branding.groupName"]')).toBeFocused();
    await expect(bar.locator('[data-fs-colour="#0060df"]')).toHaveAttribute('aria-pressed', 'true');
    // The same colour again goes back to the usual one; Clear removes the rest
    await bar.locator('[data-fs-colour="#0060df"]').click();
    expect(await page.evaluate(() => state.styles['branding.groupName'])).toEqual({ i: true });
    // Clear makes it plain, taking off the default bold too
    await bar.locator('[data-fs-act="clear"]').click();
    expect(await page.evaluate(() => state.styles['branding.groupName'])).toEqual({ b: false });
    await expect(page.locator('#sheet .doc-group')).toHaveCSS('font-weight', '400');
    await expect(page.locator('#sheet .doc-group')).toHaveCSS('font-style', 'normal');

    await page.fill('[data-bind="branding.headerNote"]', 'Costs can change.');
    await page.click('.fs-bar [data-fs-colour="#d0021b"]');
    await page.click('.fs-bar [data-fs-act="b"]');
    await expect(page.locator('#sheet .doc-note')).toHaveCSS('color', 'rgb(208, 2, 27)');
    await expect(page.locator('#sheet .doc-note')).toHaveCSS('font-weight', '800');
    await page.click('#btnUndo');
    expect(await page.evaluate(() => state.styles['branding.headerNote'])).toEqual({ c: '#d0021b' });
  });

  test('list lines (leaders, dates, notes) are styled one field at a time, and kept through a reload', async ({ page }) => {
    await page.click('details.card:has-text("Leaders") summary');
    await page.click('[data-fs="list:leaders:1:name"]');
    await page.click('.fs-bar [data-fs-colour="#1e8e3e"]');
    await page.click('details.card:has-text("Dates & notes") summary');
    await page.click('[data-add="notes"]');
    await page.fill('[data-fs="list:notes:0:text"]', 'Bring a hat.');
    await page.click('.fs-bar [data-fs-colour="#6f42c1"]');
    // Notes print in italics, so Italic shows as on; Clear makes the line upright
    await expect(page.locator('.fs-bar [data-fs-act="i"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.fs-bar [data-fs-act="b"]')).toHaveAttribute('aria-pressed', 'false');
    await page.click('.fs-bar [data-fs-act="clear"]');
    await expect(page.locator('#sheet .doc-notes p span')).toHaveCSS('font-style', 'normal');
    await page.click('.fs-bar [data-fs-colour="#6f42c1"]');
    await page.mouse.click(5, 5);
    await expect(page.locator('.fs-bar')).toBeHidden();
    await expect(page.locator('#sheet .l-name').nth(1)).toHaveCSS('color', 'rgb(30, 142, 62)');
    await expect(page.locator('#sheet .l-name').nth(0)).not.toHaveCSS('color', 'rgb(30, 142, 62)');
    await expect(page.locator('#sheet .doc-notes p span')).toHaveCSS('color', 'rgb(111, 66, 193)');
    await page.waitForTimeout(600);
    await page.reload();
    await page.waitForFunction(() => typeof state === 'object');
    await expect(page.locator('#sheet .l-name').nth(1)).toHaveCSS('color', 'rgb(30, 142, 62)');
    await expect(page.locator('[data-fs="list:leaders:1:name"]')).toHaveCSS('color', 'rgb(30, 142, 62)');
  });

  test('styles from a file are checked', async ({ page }) => {
    const s = await page.evaluate(() => {
      const n = normalise({ branding: { groupName: 'X', leaders: [{ name: 'A', phone: '', style: { name: { c: 'red;background:url(x)', b: true }, evil: { c: '#000000' } } }] },
        styles: { 'branding.groupName': { c: '#0060df', b: 'yes', x: 1 }, 'not.a.field': { c: '#d0021b' } } });
      return [n.styles, n.branding.leaders[0].style];
    });
    expect(s).toEqual([{ 'branding.groupName': { c: '#0060df' } }, { name: { b: true } }]);
    // false is kept (bold or italic turned off on a field that has it by default)
    expect(await page.evaluate(() => normalise({ styles: { 'branding.groupName': { b: false } } }).styles)).toEqual({ 'branding.groupName': { b: false } });
  });
});

test.describe('styles on picked cells', () => {
  let errors;
  test.beforeEach(async ({ page }) => { errors = await openApp(page); await fillCubs(page); });
  test.afterEach(() => { expect(errors, 'browser errors').toEqual([]); });

  test("a picked cell's picker brings the style toolbar, above the cell and the picker", async ({ page }) => {
    const td = '#sheet tbody tr:nth-child(2) td.c-patrol';
    await page.click(td);
    const bar = page.locator('.fs-bar');
    await expect(page.locator('#popover')).toBeVisible();
    await expect(bar).toBeVisible();
    // Duty patrols print bold, so Bold shows as on
    await expect(bar.locator('[data-fs-act="b"]')).toHaveAttribute('aria-pressed', 'true');
    const b = await bar.boundingBox(), c = await page.locator(td).boundingBox(), p = await page.locator('#popover').boundingBox();
    const overlaps = (x, y) => x.x < y.x + y.width && y.x < x.x + x.width && x.y < y.y + y.height && y.y < x.y + x.height;
    expect(overlaps(b, c)).toBe(false);
    expect(overlaps(b, p)).toBe(false);

    await bar.locator('[data-fs-colour="#6f42c1"]').click();
    await bar.locator('[data-fs-act="b"]').click();
    await expect(page.locator('#popover')).toBeVisible();          // still open
    expect(await page.evaluate(() => state.rows[1].cellStyle)).toEqual({ patrol: { c: '#6f42c1', b: false } });
    await expect(page.locator(`${td} .patrol`)).toHaveCSS('color', 'rgb(111, 66, 193)');
    await expect(page.locator(`${td} .patrol`)).toHaveCSS('font-weight', '400');

    // Closing the picker takes the toolbar away
    await page.mouse.click(5, 300);
    await expect(page.locator('#popover')).toBeHidden();
    await expect(bar).toBeHidden();
  });

  test('date, time, leader and uniform cells too, and Undo', async ({ page }) => {
    for (const [key, sel] of [['date', 'td.c-date'], ['time', 'td.c-time'], ['leader', 'td.c-leader'], ['uniform', 'td.c-uniform']]) {
      await page.click(`#sheet tbody tr:nth-child(3) ${sel}`);
      await page.click('.fs-bar [data-fs-act="i"]');
      await page.mouse.click(5, 300);
      expect(await page.evaluate((k) => state.rows[2].cellStyle[k], key)).toEqual({ i: true });
      await expect(page.locator(`#sheet tbody tr:nth-child(3) ${sel}`)).toHaveCSS('font-style', 'italic');
    }
    await page.click('#btnUndo');
    expect(await page.evaluate(() => state.rows[2].cellStyle.uniform)).toBeUndefined();
  });

  test('the row menu no longer has Red text', async ({ page }) => {
    await page.hover('#sheet tbody tr:nth-child(1) td.c-description');
    await page.click('#rowHandle');
    await expect(page.locator('#popover .menu')).toBeVisible();
    await expect(page.locator('#popover')).not.toContainText('Red text');
    await expect(page.locator('#popover [data-red]')).toHaveCount(0);
  });
});

test.describe('styles on picked fields (phone)', () => {
  const { defaultBrowserType, ...iPhone } = devices['iPhone 13'];
  test.use(iPhone);

  test('"Aa" beside a field brings its style toolbar', async ({ page }) => {
    const errors = await openApp(page);
    await fillCubs(page);
    await page.click('.m-row:has-text("Night Walk")');
    const panel = page.locator('.m-panel:not([hidden])');
    await expect(panel.locator('[data-red]')).toHaveCount(0);
    await panel.locator('[data-chips="leader"] .m-chip[data-v="Plover"]').click();
    await panel.locator('[data-style-cell="leader"]').click();
    const bar = page.locator('.fs-bar');
    await expect(bar).toBeVisible();
    const b = await bar.boundingBox();
    expect(b.x + b.width).toBeLessThanOrEqual(390);
    await bar.locator('[data-fs-colour="#1e8e3e"]').tap();
    expect(await page.evaluate(() => state.rows[0].cellStyle)).toEqual({ leader: { c: '#1e8e3e' } });
    // A tap elsewhere in the editor takes it away
    await panel.locator('.m-card').first().click({ position: { x: 5, y: 5 } });
    await expect(bar).toBeHidden();
    await panel.locator('[data-panel-done]').click();
    await expect(page.locator('#sheet tbody tr:nth-child(1) td.c-leader .pick')).toHaveCSS('color', 'rgb(30, 142, 62)');
    expect(errors).toEqual([]);
  });
});

test.describe('week styles', () => {
  test('clicking a Week cell styles the whole week, until a click elsewhere', async ({ page }) => {
    const errors = await openApp(page);
    await fillCubs(page);
    // Two activities in Week 2, so its cell spans both
    await page.evaluate(() => { state.rows.splice(2, 0, newRow('2026-10-25', { activity: 'Sunday hike' })); renderAll(); });
    const wk = page.locator('#sheet td.c-week', { hasText: 'Week 2' });
    await wk.click({ position: { x: 30, y: 10 } });
    const bar = page.locator('.fs-bar');
    await expect(bar).toBeVisible();
    await expect(bar.locator('[data-fs-act="b"]')).toHaveAttribute('aria-pressed', 'true');   // prints bold
    await bar.locator('[data-fs-colour="#0060df"]').click();
    await bar.locator('[data-fs-act="i"]').click();
    expect(await page.evaluate(() => state.weekStyles)).toEqual({ '2026-10-19': { c: '#0060df', i: true } });
    await expect(wk.locator('.wk')).toHaveCSS('color', 'rgb(0, 96, 223)');
    await expect(wk.locator('.wk')).toHaveCSS('font-style', 'italic');
    await expect(wk).toHaveAttribute('rowspan', '2');
    // Its + isn't styled, and still adds to the week
    await expect(wk.locator('.wk-add')).toHaveCSS('color', 'rgb(255, 255, 255)');
    await page.mouse.click(5, 300);
    await expect(bar).toBeHidden();
    // The style stays with the week when its activities change
    await page.evaluate(() => { state.rows = state.rows.filter((r) => r.activity !== 'Sunday hike'); renderAll(); });
    await expect(page.locator('#sheet td.c-week', { hasText: 'Week 2' }).locator('.wk')).toHaveCSS('color', 'rgb(0, 96, 223)');
    await page.click('#btnUndo');
    // Escape puts the bar away too
    await page.locator('#sheet td.c-week', { hasText: 'Week 3' }).click({ position: { x: 30, y: 10 } });
    await expect(bar).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(bar).toBeHidden();
    // Saved and checked
    const kept = await page.evaluate(() => normalise({ weekStyles: { '2026-10-19': { c: '#0060df' }, junk: { c: '#0060df' }, '2026-10-26': { c: 'url(x)' } } }).weekStyles);
    expect(kept).toEqual({ '2026-10-19': { c: '#0060df' } });
    expect(errors).toEqual([]);
  });
});

test.describe('week styles (phone)', () => {
  const { defaultBrowserType, ...iPhone } = devices['iPhone 13'];
  test.use(iPhone);
  test('the editor has Aa for the week', async ({ page }) => {
    const errors = await openApp(page);
    await fillCubs(page);
    await page.click('.m-row:has-text("Knots")');
    const panel = page.locator('.m-panel:not([hidden])');
    await expect(panel.locator('[data-style-field="week"]')).toContainText('Week 2');
    await panel.locator('[data-style-cell="week"]').click();
    await page.locator('.fs-bar [data-fs-act="b"]').tap();
    expect(await page.evaluate(() => state.weekStyles)).toEqual({ '2026-10-19': { b: false } });
    await panel.locator('[data-panel-done]').click();
    await expect(page.locator('#sheet td.c-week', { hasText: 'Week 2' })).toHaveCSS('font-weight', '400');
    expect(errors).toEqual([]);
  });
});

test.describe('colours in formatted text', () => {
  test('all five colours, switching between them, and back to the usual colour', async ({ page }) => {
    const errors = await openApp(page);
    await fillCubs(page);
    await typeAndSelectLast(page, cell, 'Bring a torch', 5);
    const bar = page.locator('.fmt-bar:not(.fs-bar)');
    await expect(bar.locator('[data-fmt="colour"]')).toHaveCount(5);
    await bar.locator('[data-colour="#0060df"]').click();
    expect((await row0(page)).rich).toEqual({ description: 'Bring a <span class="cb">torch</span>' });
    await expect(bar.locator('[data-colour="#0060df"]')).toHaveAttribute('aria-pressed', 'true');
    // Another colour replaces it
    await bar.locator('[data-colour="#1e8e3e"]').click();
    expect((await row0(page)).rich).toEqual({ description: 'Bring a <span class="cg">torch</span>' });
    await expect(bar.locator('[data-colour="#1e8e3e"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(bar.locator('[data-colour="#0060df"]')).toHaveAttribute('aria-pressed', 'false');
    // The same one again: back to the usual colour
    await bar.locator('[data-colour="#1e8e3e"]').click();
    expect((await row0(page)).rich).toEqual({});
    // Each colour shows when the cell is drawn again
    for (const [hex, cls, rgb] of [['#d9480f', 'co', 'rgb(217, 72, 15)'], ['#6f42c1', 'cp', 'rgb(111, 66, 193)']]) {
      await typeAndSelectLast(page, cell, 'Bring a torch', 5);
      await bar.locator(`[data-colour="${hex}"]`).click();
      await page.mouse.click(5, 300);
      await page.evaluate(() => renderAll());
      await expect(page.locator(`${cell} .${cls}`)).toHaveCSS('color', rgb);
    }
    // Saved colours from a file are kept, and unknown classes dropped
    const clean = await page.evaluate(() => cleanRich('<span class="cg">a</span><span class="evil">b</span><font color="#0060df">c</font>'));
    expect(clean).toBe('<span class="cg">a</span>b<span class="cb">c</span>');
    expect(errors).toEqual([]);
  });
});
