// Whole weeks: adding an empty week before or after the program, and adding an activity on a chosen
// day of a week. The default program is SA Term 4 2026 on Tuesdays: Week 1 is 12–18 Oct, the last
// meeting is Tue 8 Dec (Week 9).
const { test, expect, devices } = require('@playwright/test');
const { openApp, fillCubs } = require('./helpers');

const rows = (page) => page.evaluate(() => state.rows.map((r) => ({ date: r.date, emptyWeek: !!r.emptyWeek, activity: r.activity, noMeeting: r.noMeeting, time: r.time })));

test.describe('desktop', () => {
  let errors;
  test.beforeEach(async ({ page }) => { errors = await openApp(page); await fillCubs(page); });
  test.afterEach(() => { expect(errors, 'browser errors').toEqual([]); });

  test('add an empty week before and after the program', async ({ page }) => {
    await page.click('#btnAddWeek');
    await expect(page.locator('#popover [data-where="before"]')).toContainText('Hols · 5–11 Oct');
    await expect(page.locator('#popover [data-where="after"]')).toContainText('Hols · 14–20 Dec');
    await page.click('#popover [data-where="before"]');
    await page.click('#btnAddWeek');
    await page.click('#popover [data-where="after"]');

    const r = await rows(page);
    expect(r[0]).toMatchObject({ date: '2026-10-05', emptyWeek: true });
    expect(r[r.length - 1]).toMatchObject({ date: '2026-12-14', emptyWeek: true });
    const empty = page.locator('#sheet tr.empty-week');
    await expect(empty).toHaveCount(2);
    await expect(empty.first().locator('.c-week')).toHaveText(/Hols/);
    await expect(empty.first().locator('.c-date')).toHaveText('5–11 Oct');
    // Another week before goes before that one
    await page.click('#btnAddWeek');
    await expect(page.locator('#popover [data-where="before"]')).toContainText('28 Sep – 4 Oct');
  });

  test('add an activity into an empty week, picking the day', async ({ page }) => {
    await page.click('#btnAddWeek');
    await page.click('#popover [data-where="before"]');
    await page.click('#sheet tr.empty-week .wk-empty-add');
    const days = page.locator('#popover .day');
    await expect(days).toHaveCount(7);
    await expect(page.locator('#popover .day.meet')).toHaveText(/Tue\s*6/);
    await page.click('#popover .day[data-day="2026-10-10"]');
    // The empty week has become the activity, ready to type in
    await expect(page.locator('#sheet tr.empty-week')).toHaveCount(0);
    await page.keyboard.type('Holiday hike');
    const r = await rows(page);
    expect(r[0]).toMatchObject({ date: '2026-10-10', emptyWeek: false, activity: 'Holiday hike', time: '' });
  });

  test("the week cell's + adds another activity to that week", async ({ page }) => {
    const week3 = page.locator('#sheet td.c-week', { hasText: 'Week 3' });
    await week3.hover();
    await week3.locator('.wk-add').click();
    await expect(page.locator('#popover .pop-sub')).toHaveText('Week 3 · 26 Oct – 1 Nov');
    await page.click('#popover .day[data-day="2026-11-01"]');
    await page.keyboard.type('Group church parade');
    await expect(page.locator('#sheet td.c-week', { hasText: 'Week 3' })).toHaveAttribute('rowspan', '2');
    expect((await rows(page)).filter((x) => x.date === '2026-11-01')).toEqual([
      { date: '2026-11-01', emptyWeek: false, activity: 'Group church parade', noMeeting: false, time: '' },
    ]);
    // The meeting night keeps the usual time
    await week3.hover();
    await week3.locator('.wk-add').click();
    await page.click('#popover .day.meet');
    const tue = (await rows(page)).filter((x) => x.date === '2026-10-27');
    expect(tue.map((x) => x.time)).toEqual(['18:15–19:45', '18:15–19:45']);
  });

  test('the row menu adds to the week too, and an empty week can become a week off or go', async ({ page }) => {
    await page.hover('#sheet tbody tr:nth-child(2) td.c-date');
    await page.click('#rowHandle');
    await page.click('#popover [data-act="week"]');
    await expect(page.locator('#popover .pop-sub')).toHaveText('Week 2 · 19–25 Oct');
    await page.keyboard.press('Escape');
    await page.mouse.click(5, 5);

    await page.click('#btnAddWeek');
    await page.click('#popover [data-where="after"]');
    await page.hover('#sheet tr.empty-week td.c-date');
    await page.click('#rowHandle');
    await page.click('#popover [data-act="off"]');
    let r = await rows(page);
    expect(r[r.length - 1]).toMatchObject({ date: '2026-12-15', emptyWeek: false, noMeeting: true, activity: 'No Cubs this week' });

    await page.click('#btnAddWeek');
    await page.click('#popover [data-where="after"]');
    await page.hover('#sheet tr.empty-week td.c-date');
    await page.click('#rowHandle');
    await page.click('#popover [data-act="del"]');
    await expect(page.locator('#sheet tr.empty-week')).toHaveCount(0);
    r = await rows(page);
    expect(r.some((x) => x.emptyWeek)).toBe(false);
  });

  test('an empty week is saved, left out of the calendar and spreadsheet, and moving an activity in fills it', async ({ page }) => {
    await page.click('#btnAddWeek');
    await page.click('#popover [data-where="after"]');
    await page.reload();
    await page.waitForFunction(() => typeof state === 'object');
    expect((await rows(page)).filter((x) => x.emptyWeek)).toEqual([{ date: '2026-12-14', emptyWeek: true, activity: '', noMeeting: false, time: '' }]);

    const ics = await page.evaluate(() => { let text = ''; const real = downloadFile; downloadFile = (n, t) => { text = t; }; exportCalendar(); downloadFile = real; return text; });
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(9);
    const csv = await page.evaluate(() => { let text = ''; const real = downloadFile; downloadFile = (n, t) => { text = t; }; exportCsv(); downloadFile = real; return text; });
    expect(csv.trim().split('\r\n')).toHaveLength(10);

    // Week 9's activity moved a week later lands in the empty week, which then goes
    await page.evaluate(() => { const r = state.rows.find((x) => x.date === '2026-12-08'); moveRow(r.id, 1); renderDoc(); });
    expect((await rows(page)).some((x) => x.emptyWeek)).toBe(false);
  });

  test('Generate dates with an empty week keeps every meeting night', async ({ page }) => {
    // Weeks run Monday to Sunday and the meeting is on Monday, so the empty week's first day is a meeting night
    await page.evaluate(() => { state.term.meetingDay = 1; state.rows = generateRows(); state.rows[0].activity = 'Kept'; renderDoc(); });
    await page.click('#btnAddWeek');
    await page.click('#popover [data-where="after"]');
    const last = (await rows(page)).at(-1);
    expect(last.emptyWeek).toBe(true);
    await page.evaluate(() => { state.term.end = '2026-12-18'; });
    await page.click('#btnGenerate');
    await page.click('.modal [data-i="2"]');
    const r = await rows(page);
    expect(r.some((x) => x.date === last.date && !x.emptyWeek)).toBe(true);
    expect(r.some((x) => x.emptyWeek)).toBe(false);
  });
});

test.describe('phone', () => {
  const { defaultBrowserType, ...iPhone } = devices['iPhone 13'];
  test.use(iPhone);

  test('add a week after, then an activity in it on a chosen day', async ({ page }) => {
    const errors = await openApp(page);
    await fillCubs(page);
    await page.click('#mAdd');
    await expect(page.locator('[data-add="after"]')).toContainText('Empty Hols · 14–20 Dec');
    await page.click('[data-add="after"]');
    const empty = page.locator('.m-row.m-empty-week');
    await expect(empty).toHaveText(/14–20 Dec/);
    await empty.click();
    await page.click('.m-panel:not([hidden]) .day[data-day="2026-12-16"]');
    await page.fill('[data-f="activity"]', 'End of year party');
    await page.click('.m-panel:not([hidden]) [data-panel-done]');
    await expect(page.locator('.m-row.m-empty-week')).toHaveCount(0);
    await expect(page.locator('.m-row', { hasText: 'End of year party' })).toContainText('Wed 16 Dec');

    // The + under a week's label, and "Activity on another day" in the Add menu
    await page.locator('.m-week', { hasText: 'Week 2' }).locator('.m-wk-add').click();
    await page.click('.m-panel:not([hidden]) .day[data-day="2026-10-25"]');
    await page.fill('[data-f="activity"]', 'Sunday hike');
    await page.click('.m-panel:not([hidden]) [data-panel-done]');
    await expect(page.locator('.m-week', { hasText: 'Week 2' }).locator('.m-row')).toHaveCount(2);
    await page.click('#mAdd');
    await page.click('[data-add="day"]');
    await expect(page.locator('[data-pick]').first()).toContainText('Week 1');
    expect(errors).toEqual([]);
  });
});

test.describe('moving outside the term', () => {
  let errors;
  test.beforeEach(async ({ page }) => { errors = await openApp(page); await fillCubs(page); });
  test.afterEach(() => { expect(errors, 'browser errors').toEqual([]); });

  test('an activity moves into the holidays before or after the term, which then show as Hols weeks', async ({ page }) => {
    const menuFor = async (name) => {
      await page.hover(`#sheet tbody tr:has(.ed[data-key="activity"]:text-is("${name}")) td.c-description`);
      await page.click('#rowHandle');
    };
    await menuFor('Gingerbread Camps');
    await expect(page.locator('#popover [data-act="down"]')).toBeEnabled();
    await expect(page.locator('#popover [data-act="down"]')).toHaveText('Move to Hols (14–20 Dec)');
    await page.click('#popover [data-act="down"]');
    let last = page.locator('#sheet tbody tr').last();
    await expect(last.locator('.c-week .wk')).toHaveText('Hols');
    await expect(last.locator('.c-date')).toHaveText('Tue 15 Dec');

    // And a week further, and back again
    await menuFor('Gingerbread Camps');
    await expect(page.locator('#popover [data-act="down"]')).toHaveText('Move to Hols (21–27 Dec)');
    await expect(page.locator('#popover [data-act="up"]')).toHaveText('Move to Week 9');
    await page.click('#popover [data-act="up"]');
    await expect(page.locator('#sheet tbody tr').last().locator('.c-week .wk')).toHaveText('Week 9');

    await menuFor('Night Walk');
    await expect(page.locator('#popover [data-act="up"]')).toHaveText('Move to Hols (5–11 Oct)');
    await page.click('#popover [data-act="up"]');
    const first = page.locator('#sheet tbody tr').first();
    await expect(first.locator('.c-week .wk')).toHaveText('Hols');
    await expect(first.locator('.c-date')).toHaveText('Tue 6 Oct');
  });

  test('an empty week moves too, but not onto a week with something in it', async ({ page }) => {
    await page.click('#btnAddWeek');
    await page.click('#popover [data-where="after"]');
    await page.hover('#sheet tr.empty-week td.c-date');
    await page.click('#rowHandle');
    await expect(page.locator('#popover [data-act="up"]')).toBeDisabled();
    await page.click('#popover [data-act="down"]');
    await expect(page.locator('#sheet tr.empty-week .c-date')).toHaveText('21–27 Dec');
  });
});
