// The program sheet on desktop: fitting, printing, editing, rows and weeks.
const { test, expect } = require('@playwright/test');
const { openApp, fillCubs, pdfPages, pdfPageSize } = require('./helpers');

test.describe('sheet', () => {
  let errors;
  test.beforeEach(async ({ page }) => { errors = await openApp(page); });
  test.afterEach(() => { expect(errors, 'browser errors').toEqual([]); });

  test('the page loads its styles and scripts', async ({ page }) => {
    // Guards against a broken published index.html (e.g. a damaged tag hiding the stylesheets).
    const sheets = await page.evaluate(() => [...document.styleSheets].map((x) => (x.href || '').split('/').pop().split('?')[0]).filter(Boolean));
    expect(sheets).toEqual(expect.arrayContaining(['no5tyle.css', 'app.css', 'mobile.css']));
    await expect(page.locator('.appbar')).toHaveCSS('height', '60px');
    // The shared look (no5tyle.github.io/shared/no5tyle.css) supplies the colours
    await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(242, 242, 247)');
    await expect(page.locator('#btnExport')).toHaveCSS('background-color', 'rgb(0, 122, 255)');
    // The qStored app switcher (js/qstored-switcher.js) replaces the icon at the top left: qStored's apps only,
    // and the internal dashboard only for sysadmins (tests/account.spec.js)
    await page.locator('.appbar .qs-switch-btn').click();
    await expect(page.locator('.appbar .qs-switch-item[aria-current=page]')).toContainText('Program Builder');
    await expect(page.locator('.appbar .qs-switch-name')).toHaveText(['Program Builder', 'Pinewood Control', 'Quarters Master']);
    await page.keyboard.press('ArrowDown');
    await expect(page.locator('.appbar .qs-switch-item').nth(1)).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.locator('.appbar .qs-switch-menu')).toBeHidden();
    await expect(page.locator('.appbar .qs-switch-btn')).toBeFocused();
    await expect(page.locator('#sheet .prog')).toHaveCount(1);
  });

  test('a normal term fits one page at full size', async ({ page }) => {
    await fillCubs(page);
    await expect(page.locator('#fitStatus')).toHaveText('Fits on one page');
    await expect(page.locator('#fitStatus')).toHaveAttribute('data-pt', '11');
    await expect(page.locator('#fitStatus')).toHaveAttribute('title', /11pt/);
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
    await expect(page.locator('#fitStatus')).toHaveText(/^Runs to \d+ pages$/);
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
      ...[...document.querySelectorAll('.prog .ed, .prog .dt')].filter((e) => e.scrollWidth > e.clientWidth + 1),
      ...[...document.querySelectorAll('.prog .pick, .prog .patrol, .prog .wk, .prog .th-l')].filter((e) => !overflowsNot(e)),
    ].map((e) => e.textContent));
    // Details to help if this fails on another machine (fonts, sizes, widths).
    const details = await page.evaluate(() => {
      const e = [...document.querySelectorAll('.prog .ed, .prog .dt')].find((x) => x.scrollWidth > x.clientWidth + 1);
      return JSON.stringify({
        status: document.querySelector('#fitStatus').textContent + ' ' + document.querySelector('#fitStatus').dataset.pt + 'pt',
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
      // Centred on the row's right-hand border, level with it
      const row = await page.locator(`tbody tr:has(.ed[data-key="activity"]:text-is("${name}"))`).boundingBox();
      expect(Math.abs(h.x + h.width / 2 - (row.x + row.width))).toBeLessThan(2);
      expect(Math.abs(h.y + h.height / 2 - (row.y + row.height / 2))).toBeLessThan(2);
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
    // The term starts on Tuesday 27 January, after Week 1's Monday
    expect(off).toEqual(['2026-01-26 No Cubs – Term starts Tue 27 Jan', '2026-03-09 No Cubs – Adelaide Cup Day', '2026-04-06 No Cubs – Easter Monday']);
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

  test('dragging between two headings resizes those columns', async ({ page }) => {
    await fillCubs(page);
    const widths = () => page.evaluate(() => Object.fromEntries(state.columns.filter((c) => c.visible).map((c) => [c.key, c.width])));
    const before = await widths();
    const px = () => page.evaluate(() => [...document.querySelectorAll('.prog thead th')].map((th) => Math.round(th.getBoundingClientRect().width)));
    const pxBefore = await px();
    const i = await page.evaluate(() => state.columns.filter((c) => c.visible).findIndex((c) => c.key === 'description'));
    const grip = await page.locator(`.col-grip[data-col="${i}"]`).boundingBox();
    await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
    await page.mouse.down();
    await page.mouse.move(grip.x + grip.width / 2 + 30, grip.y + grip.height / 2, { steps: 6 });
    await page.mouse.up();
    const after = await widths();
    expect(after.description).toBeGreaterThan(before.description);
    // The room comes from the columns to the right; those to the left don't change.
    const rightKeys = await page.evaluate((k) => state.columns.filter((c) => c.visible).slice(k + 1).map((c) => c.key), i);
    expect(rightKeys.reduce((a, k) => a + after[k], 0)).toBeLessThan(rightKeys.reduce((a, k) => a + before[k], 0));
    expect(after.time).toBeCloseTo(before.time, 0);
    const pxAfter = await px();
    expect(pxAfter[i]).toBeGreaterThan(pxBefore[i] + 15);
    // There are no width numbers in Columns any more; Undo puts the widths back.
    await expect(page.locator('#columnsList input[data-field="width"]')).toHaveCount(0);
    await page.click('#btnUndo');
    expect((await widths()).description).toBe(before.description);
  });

  test('a narrow Date column wraps with the day above the date', async ({ page }) => {
    await fillCubs(page);
    await page.evaluate(() => { state.options.dateFormat = 'long'; renderAll(); });
    const lines = () => page.evaluate(() => {
      const dt = document.querySelector('tbody .dt');
      const r = document.createRange(); r.selectNodeContents(dt);
      return [new Set([...r.getClientRects()].map((x) => Math.round(x.top))).size, dt.textContent.replace(/\u00a0/g, ' ')];
    });
    expect(await lines()).toEqual([1, 'Tuesday 13 October']);
    // Drag the Date column's right border well to the left.
    const i = await page.evaluate(() => state.columns.filter((c) => c.visible).findIndex((c) => c.key === 'date'));
    const grip = await page.locator(`.col-grip[data-col="${i}"]`).boundingBox();
    await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
    await page.mouse.down();
    await page.mouse.move(grip.x - 200, grip.y + grip.height / 2, { steps: 8 });
    await page.mouse.up();
    expect(await lines()).toEqual([2, 'Tuesday 13 October']);   // "Tuesday" above "13 October"
  });

  test('a Week column dragged narrower wraps the number below and stays', async ({ page }) => {
    await fillCubs(page);
    await page.evaluate(() => { state.columns.find((c) => c.key === 'week').width = 9; renderAll(); });
    const lines = () => page.evaluate(() => {
      const w = document.querySelector('tbody .wk');
      const r = document.createRange(); r.selectNodeContents(w);
      return new Set([...r.getClientRects()].map((x) => Math.round(x.top))).size;
    });
    expect(await lines()).toBe(1);
    const grip = await page.locator('.col-grip[data-col="0"]').boundingBox();
    await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
    await page.mouse.down();
    await page.mouse.move(grip.x - 300, grip.y + grip.height / 2, { steps: 8 });
    await page.mouse.up();
    expect(await lines()).toBe(2);           // "Week" above "1"
    await page.evaluate(() => renderAll());  // and it doesn't bounce back on the next refit
    expect(await lines()).toBe(2);
  });

  test('choosing a challenge area does not change the row height', async ({ page }) => {
    await page.evaluate(() => {
      state.rows.forEach((r) => { r.activity = 'Night Walk'; r.description = 'Walk to a nearby park.'; r.challenge = ''; });
      state.options.stretch = false;
      renderAll();
    });
    const heights = () => page.evaluate(() => [...document.querySelectorAll('tbody tr')].slice(0, 3).map((tr) => Math.round(tr.getBoundingClientRect().height)));
    const before = await heights();
    await page.evaluate(() => { state.rows[0].challenge = 'outdoors'; state.rows[1].challenge = 'creative'; renderAll(); });
    expect(await heights()).toEqual(before);
    // And the icon still fills most of the cell's height.
    const ratio = await page.evaluate(() => {
      const icon = document.querySelector('tbody tr td.c-challenge .ch-icon'), td = icon.closest('td');
      return icon.getBoundingClientRect().height / td.getBoundingClientRect().height;
    });
    expect(ratio).toBeGreaterThan(0.8);
  });

  test("an older program's red text becomes formatting", async ({ page }) => {
    await page.evaluate(() => {
      const d = JSON.parse(JSON.stringify(state));
      Object.assign(d.rows[0], { red: ['time', 'activity'], activity: 'Hike & <climb>' });
      state = normalise(d); renderAll();
    });
    const r = await page.evaluate(() => [state.rows[0].red, state.rows[0].cellStyle, state.rows[0].rich, state.rows[0].activity]);
    expect(r).toEqual([undefined, { time: { b: true, c: '#d0021b' } }, { activity: '<span class="r"><b>Hike &amp; &lt;climb&gt;</b></span>' }, 'Hike & <climb>']);
    const color = await page.evaluate(() => getComputedStyle(document.querySelector('tbody tr:nth-child(1) td.c-time .ed')).color);
    expect(color).toBe('rgb(208, 2, 27)');
    await expect(page.locator('tbody tr:nth-child(1) td.c-activity .ed .r b')).toHaveText('Hike & <climb>');
  });

  test('dates under the program print their text and hide when empty', async ({ page }) => {
    await page.evaluate(() => { state.extras.dates = [{ id: 'a', what: 'Camp', when: '', date: '2026-10-23', endDate: '2026-10-25' }]; renderAll(); });
    await expect(page.locator('.doc-date')).toHaveText('Camp – 23–25 October');
    await page.evaluate(() => { state.extras.dates = []; renderAll(); });
    await expect(page.locator('.doc-extras')).toHaveCount(0);
  });
});

test.describe('section logo', () => {
  test('with the name or the emblem only', async ({ page }) => {
    const errors = await openApp(page);
    const logo = page.locator('#sheet .doc-logo img');
    await expect(logo).toHaveAttribute('src', 'assets/section-logos/cubs.png');
    await expect(page.locator('#logoStyleField')).toBeVisible();
    await page.selectOption('[data-bind="branding.logoStyle"]', 'emblem');
    await expect(logo).toHaveAttribute('src', 'assets/section-logos/cubs-emblem.png');
    await expect(page.locator('#logoPreview img')).toHaveAttribute('src', 'assets/section-logos/cubs-emblem.png');
    // Every section has both, and they load
    for (const s of ['joeys', 'scouts', 'venturers', 'rovers', 'cubs']) {
      await page.selectOption('[data-bind="branding.section"]', s);
      await expect(logo).toHaveAttribute('src', `assets/section-logos/${s}-emblem.png`);
      await expect.poll(() => logo.evaluate((img) => img.complete && img.naturalWidth)).toBeGreaterThan(0);
      // The emblem is cropped: about as tall as it is wide (the full logo is much taller)
      const ratio = await logo.evaluate((img) => img.naturalHeight / img.naturalWidth);
      expect(ratio).toBeLessThan(1.05);
    }
    // A logo of your own: the choice goes, and comes back with the section logo
    await page.evaluate(() => { state.branding.logo = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=='; renderAll(); });
    await expect(page.locator('#logoStyleField')).toBeHidden();
    await page.click('#btnLogoClear');
    await expect(page.locator('#logoStyleField')).toBeVisible();
    await expect(logo).toHaveAttribute('src', 'assets/section-logos/cubs-emblem.png');
    expect(errors).toEqual([]);
  });
});

test('the patrol column is headed Patrol, also in programs saved with the old Duty Patrol heading', async ({ page }) => {
  await page.addInitScript(() => { if (!localStorage.getItem('scoutProgramBuilder.welcome')) localStorage.setItem('scoutProgramBuilder.welcome', 'done'); });
  await page.goto('/');
  await page.waitForFunction(() => typeof state === 'object');
  await expect(page.locator('#sheet thead th', { hasText: /^Patrol$/ })).toHaveCount(1);
  const labels = await page.evaluate(() => {
    const old = JSON.parse(JSON.stringify(state));
    old.columns.find((c) => c.key === 'patrol').label = 'Duty Patrol';
    const mine = JSON.parse(JSON.stringify(state));
    mine.columns.find((c) => c.key === 'patrol').label = 'Duty';
    const label = (s) => normalise(s).columns.find((c) => c.key === 'patrol').label;
    return [label(old), label(mine)];
  });
  expect(labels).toEqual(['Patrol', 'Duty']);
});
