// The program sheet on desktop: fitting, printing, editing, rows and weeks.
const { test, expect } = require('@playwright/test');
const { openApp, fillCubs, pdfPages, pdfPageSize } = require('./helpers');

test.describe('sheet', () => {
  let errors;
  test.beforeEach(async ({ page }) => { errors = await openApp(page); });
  test.afterEach(() => { expect(errors, 'browser errors').toEqual([]); });

  test('a normal term fits one page at full size', async ({ page }) => {
    await fillCubs(page);
    await expect(page.locator('#fitStatus')).toHaveText('Fits 1 page · 11pt');
  });

  test('the browser printout is one landscape A4 page', async ({ page }) => {
    await fillCubs(page);
    await page.evaluate(() => { state.extras.notes = [{ heading: 'Friday 6 Nov', text: 'Bunnings BBQ' }]; state.branding.headerNote = 'Costs may change.'; renderAll(); });
    await page.emulateMedia({ media: 'print' });
    const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true });
    expect(pdfPages(pdf)).toBe(1);
    const [w, h] = pdfPageSize(pdf);
    expect(w).toBeGreaterThan(h);
  });

  test('a program too long for one page prints over several pages', async ({ page }) => {
    await page.evaluate(() => {
      const long = 'A long description that keeps going and going so that the program cannot fit on one page. '.repeat(4);
      state.rows.forEach((r) => { r.description = long; r.notes = long; });
      renderAll();
    });
    await expect(page.locator('#fitStatus')).toContainText('pages');
    await page.emulateMedia({ media: 'print' });
    expect(pdfPages(await page.pdf({ preferCSSPageSize: true }))).toBeGreaterThan(1);
  });

  test('no word is ever broken across lines', async ({ page }) => {
    await page.evaluate(() => {
      Object.assign(state.rows[0], { leader: 'Hendrik/Possum/Chris', cost: '$85-$100', forms: 'MyScout', activity: 'Remembrance Day Service: Macclesfield RSL' });
      state.options.orientation = 'portrait';
      state.columns.forEach((c) => { c.visible = true; });
      renderAll();
    });
    const broken = await page.evaluate(() => [
      ...[...document.querySelectorAll('.prog .ed, .prog .dt')].filter((e) => e.scrollWidth > e.clientWidth + 0.5),
      ...[...document.querySelectorAll('.prog .pick, .prog .patrol, .prog .wk, .prog .th-l')].filter((e) => !overflowsNot(e)),
    ].map((e) => e.textContent));
    // Details to help if this fails on another machine (fonts, sizes, widths).
    const details = await page.evaluate(() => {
      const e = [...document.querySelectorAll('.prog .ed, .prog .dt')].find((x) => x.scrollWidth > x.clientWidth + 0.5);
      return JSON.stringify({
        status: document.querySelector('#fitStatus').textContent,
        nunito: document.fonts.check('12px Nunito'),
        cell: e && { text: e.textContent, fontSize: e.style.fontSize || getComputedStyle(e).fontSize, scrollW: e.scrollWidth, clientW: e.clientWidth, colW: e.closest('td').getBoundingClientRect().width },
      });
    });
    expect(broken, details).toEqual([]);
  });

  test('typing in a cell edits the program', async ({ page }) => {
    await page.click('tbody tr:nth-child(1) .ed[data-key="activity"]');
    await page.keyboard.type('Night Walk');
    await expect.poll(() => page.evaluate(() => state.rows[0].activity)).toBe('Night Walk');
  });

  test('the row handle opens the menu for the row under the mouse', async ({ page }) => {
    await page.evaluate(() => {
      state.rows.forEach((r, i) => { r.activity = `A${i + 1}`; });
      state.rows.splice(4, 0, newRow('2026-11-08', { activity: 'Second in week 4' }));
      renderAll();
    });
    for (const name of ['Second in week 4', 'A4']) {
      const cell = page.locator(`tbody tr:has(.ed[data-key="activity"]:text-is("${name}")) td.c-description`);
      const box = await cell.boundingBox();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      const h = await page.locator('#rowHandle').boundingBox();
      await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2, { steps: 20 });
      await page.mouse.down(); await page.mouse.up();
      await expect.poll(() => page.evaluate(() => rowById(popCtx?.id)?.activity)).toBe(name);
      await page.keyboard.press('Escape');
    }
  });

  test('moving an activity keeps its weekday and changes week', async ({ page }) => {
    await page.evaluate(() => { state.rows[2].activity = 'Mover'; renderAll(); moveRow(state.rows[2].id, -1); renderDoc(); });
    const r = await page.evaluate(() => { const x = state.rows.find((y) => y.activity === 'Mover'); return [x.date, weekOf(x.date)]; });
    expect(r).toEqual(['2026-10-20', 2]);
  });

  test('rows sort by date then start time, untimed last', async ({ page }) => {
    await page.evaluate(() => {
      state.rows.push(newRow('2026-10-13', { activity: 'TBA item', time: 'TBA' }));
      state.rows.push(newRow('2026-10-13', { activity: 'Early', time: '5:00 PM' }));
      renderAll();
    });
    const order = await page.evaluate(() => state.rows.filter((r) => r.date === '2026-10-13').map((r) => r.activity || 'meeting'));
    expect(order).toEqual(['Early', 'meeting', 'TBA item']);
  });

  test('public holidays on meeting nights become weeks off', async ({ page }) => {
    await page.selectOption('[data-bind="term.term"]', '1');
    await page.selectOption('[data-bind="term.meetingDay"]', '1');
    const off = await page.evaluate(() => state.rows.filter((r) => r.noMeeting).map((r) => `${r.date} ${r.activity}`));
    expect(off).toEqual(['2026-03-09 No Cubs – Adelaide Cup Day', '2026-04-06 No Cubs – Easter Monday']);
    const patrols = await page.evaluate(() => state.rows.filter((r) => !r.noMeeting).map((r) => r.patrol).slice(4, 6));
    expect(patrols).toEqual(['Green', 'Orange']);   // holidays don't use up a duty patrol turn
  });

  test('the legend sits left of the leaders when there is room, else below', async ({ page }) => {
    await fillCubs(page);
    const where = () => page.evaluate(() => {
      const lg = document.querySelector('.doc-legend'), ld = document.querySelector('.doc-leaders');
      return lg.classList.contains('beside') && lg.getBoundingClientRect().right <= ld.getBoundingClientRect().left ? 'left' : 'below';
    });
    expect(await where()).toBe('left');
    await page.evaluate(() => { state.branding.groupName = '1st Strathalbyn and Districts Scout Group'; state.branding.leaders = Array.from({ length: 6 }, (_, i) => ({ name: `Leader ${i}`, phone: '0400 000 000' })); renderAll(); });
    expect(await where()).toBe('below');
  });

  test('leader and uniform pickers set the cell', async ({ page }) => {
    await fillCubs(page);
    await page.click('tbody tr:nth-child(1) td.c-leader');
    await page.click('#popover .choice[data-v="Baloo"]');
    await page.click('tbody tr:nth-child(1) td.c-uniform');
    await page.click('#popover .choice[data-v="No"]');
    await page.click('tbody tr:nth-child(2) td.c-uniform');
    await page.fill('#pPick', 'Camp');
    await page.keyboard.press('Enter');
    expect(await page.evaluate(() => state.rows.slice(0, 2).map((r) => [r.leader, r.uniform]))).toEqual([['Baloo', 'No'], ['', 'Camp']]);
  });

  test('red text marks a single cell', async ({ page }) => {
    await page.evaluate(() => { state.rows[0].red = ['time']; renderAll(); });
    const color = await page.evaluate(() => getComputedStyle(document.querySelector('tbody tr:nth-child(1) td.c-time .ed')).color);
    expect(color).toBe('rgb(208, 2, 27)');
  });

  test('dates under the program print their text and hide when empty', async ({ page }) => {
    await page.evaluate(() => { state.extras.dates = [{ id: 'a', what: 'Camp', when: '', date: '2026-10-23', endDate: '2026-10-25' }]; renderAll(); });
    await expect(page.locator('.doc-date')).toHaveText('Camp – 23–25 October');
    await page.evaluate(() => { state.extras.dates = []; renderAll(); });
    await expect(page.locator('.doc-extras')).toHaveCount(0);
  });
});
