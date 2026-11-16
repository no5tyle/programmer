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

test.describe('a term starting partway through a week', () => {
  let errors;
  test.beforeEach(async ({ page }) => { errors = await openApp(page); });
  test.afterEach(() => { expect(errors, 'browser errors').toEqual([]); });

  // VIC Term 1 2027 starts on Thursday 28 January
  const setTerm = (page, meetingDay, weekStart = 1) => page.evaluate(([day, ws]) => {
    Object.assign(state.term, { region: 'VIC', year: 2027, term: 1, start: '2027-01-28', end: '2027-03-25', meetingDay: day });
    state.options.weekStart = ws;
    state.rows = generateRows();
    renderAll();
    return state.rows.slice(0, 2).map((r) => ({ date: r.date, noMeeting: r.noMeeting, activity: r.activity, patrol: r.patrol, wk: weekOf(r.date) }));
  }, [meetingDay, weekStart]);

  test('a meeting night before the start is Week 1, marked as a week off', async ({ page }) => {
    const rows2 = await setTerm(page, 1);
    expect(rows2).toEqual([
      { date: '2027-01-25', noMeeting: true, activity: 'No Cubs – Term starts Thu 28 Jan', patrol: '', wk: 1 },
      { date: '2027-02-01', noMeeting: false, activity: '', patrol: 'Blue', wk: 2 },
    ]);
    const first = page.locator('#sheet tbody tr').first();
    await expect(first).toHaveClass(/no-meeting/);
    await expect(first.locator('.c-week .wk')).toHaveText('Week 1');
    await expect(first).toContainText('No Cubs – Term starts Thu 28 Jan');
    // Not counted as a meeting
    await expect(page.locator('#termHint')).toContainText('8 Monday meetings');
  });

  test('no extra row when the meeting night is on or after the start, and the weeks setting counts', async ({ page }) => {
    expect((await setTerm(page, 4))[0]).toMatchObject({ date: '2027-01-28', noMeeting: false, wk: 1 });
    expect((await setTerm(page, 5))[0]).toMatchObject({ date: '2027-01-29', noMeeting: false, wk: 1 });
    // Weeks running Sunday to Saturday: a Sunday meeting before the start is in Week 1 too
    expect((await setTerm(page, 0, 0))[0]).toMatchObject({ date: '2027-01-24', noMeeting: true, wk: 1 });
    // Weeks running Monday to Sunday: Sunday is the end of the week, so the first Sunday (31 Jan) is in the term
    expect((await setTerm(page, 0, 1))[0]).toMatchObject({ date: '2027-01-31', noMeeting: false, wk: 1 });
  });

  test('Add missing dates fills it in for a program made before', async ({ page }) => {
    await setTerm(page, 1);
    await page.evaluate(() => { state.rows = state.rows.filter((r) => r.date !== '2027-01-25'); state.rows[0].activity = 'Kept'; renderAll(); });
    await page.click('#btnGenerate');
    await page.click('.modal [data-i="2"]');
    const r = await page.evaluate(() => state.rows.slice(0, 2).map((x) => [x.date, x.activity]));
    expect(r).toEqual([['2027-01-25', 'No Cubs – Term starts Thu 28 Jan'], ['2027-02-01', 'Kept']]);
  });
});

test.describe('menu buttons', () => {
  test("the ⋮ and a week's + close their menu when it's open", async ({ page }) => {
    const errors = await openApp(page);
    await fillCubs(page);
    await page.hover('#sheet tbody tr:nth-child(2) td.c-description');
    await page.click('#rowHandle');
    await expect(page.locator('#popover .menu')).toBeVisible();
    await page.click('#rowHandle');
    await expect(page.locator('#popover')).toBeHidden();
    await page.click('#rowHandle');
    await expect(page.locator('#popover .menu')).toBeVisible();
    await page.keyboard.press('Escape');
    await page.mouse.click(5, 5);

    const wk = page.locator('#sheet td.c-week', { hasText: 'Week 3' });
    await wk.hover();
    await wk.locator('.wk-add').click();
    await expect(page.locator('#popover .days')).toBeVisible();
    await wk.hover();
    await wk.locator('.wk-add').click();
    await expect(page.locator('#popover')).toBeHidden();
    // Another week's + moves the picker to that week
    await wk.hover();
    await wk.locator('.wk-add').click();
    const wk4 = page.locator('#sheet td.c-week', { hasText: 'Week 4' });
    await wk4.hover();
    await wk4.locator('.wk-add').click();
    await expect(page.locator('#popover .pop-sub')).toContainText('Week 4');
    // An empty week's Add button too
    await page.mouse.click(5, 5);
    await page.click('#btnAddWeek');
    await page.click('#popover [data-where="after"]');
    await page.click('#sheet tr.empty-week .wk-empty-add');
    await expect(page.locator('#popover .days')).toBeVisible();
    await page.click('#sheet tr.empty-week .wk-empty-add');
    await expect(page.locator('#popover')).toBeHidden();
    expect(errors).toEqual([]);
  });
});

test.describe('final touches', () => {
  let errors;
  test.beforeEach(async ({ page }) => { errors = await openApp(page); });
  test.afterEach(() => { expect(errors, 'browser errors').toEqual([]); });

  test('the calendar leaves out "-" for leader, duty patrol, notes and the rest', async ({ page }) => {
    const ics = await page.evaluate(() => {
      Object.assign(state.rows[0], { activity: 'Unit Council', description: 'Patrol leaders only.', leader: '-', patrol: '-', notes: '-', forms: '-', cost: '-', uniform: '-', where: '-' });
      Object.assign(state.rows[1], { activity: 'Knots', leader: 'Baloo', patrol: 'Green', notes: 'Bring rope' });
      let text = ''; const real = downloadFile; downloadFile = (n, t) => { text = t; }; exportCalendar(); downloadFile = real;
      return text.replace(/\r\n /g, '');
    });
    const ev = (name) => ics.split('BEGIN:VEVENT').find((e) => e.includes(`SUMMARY:Cubs: ${name}`));
    expect(ev('Unit Council')).toContain('DESCRIPTION:Patrol leaders only.\r\n');
    expect(ev('Unit Council')).not.toMatch(/Leader|Duty patrol|LOCATION|\\n-/);
    expect(ev('Knots')).toContain('Leader: Baloo\\nDuty patrol: Green\\nBring rope');
  });

  test("a term ending before its last week's meeting night: that night is a week off, and the whole week counts", async ({ page }) => {
    // SA Term 4 2026 ends on Friday 11 December; with Saturday meetings, its last week's Saturday is after it
    const rows = await page.evaluate(() => {
      state.term.meetingDay = 6; state.rows = generateRows(); renderAll();
      return state.rows.slice(-2).map((r) => ({ date: r.date, noMeeting: r.noMeeting, activity: r.activity, wk: weekOf(r.date) }));
    });
    expect(rows).toEqual([
      { date: '2026-12-05', noMeeting: false, activity: '', wk: 8 },
      { date: '2026-12-12', noMeeting: true, activity: 'No Cubs – Term ends Fri 11 Dec', wk: 9 },
    ]);
    await expect(page.locator('#sheet tbody tr').last().locator('.c-week .wk')).toHaveText('Week 9');
    await expect(page.locator('#termHint')).toContainText('8 Saturday meetings');
    // Tuesdays: the last week's Tuesday is in the term, so nothing extra
    const tue = await page.evaluate(() => { state.term.meetingDay = 2; return generateRows().slice(-1)[0].date; });
    expect(tue).toBe('2026-12-08');
  });

  test('with the Time column hidden, the date picker sets the time too (and the phone editor still has it)', async ({ page }) => {
    await page.evaluate(() => { state.columns.find((c) => c.key === 'time').visible = false; renderAll(); });
    const td = page.locator('#sheet tbody tr:nth-child(1) td.c-date');
    await expect(td).toContainText('18:15–19:45');
    await td.click();
    await expect(page.locator('#pTime')).toHaveText('18:15–19:45');
    await page.click('#pTime');
    await expect(page.locator('#tStart')).toHaveValue('18:15');
    await page.fill('#tStart', '17:00');
    await page.click('#tDone');
    expect(await page.evaluate(() => state.rows[0].time)).toBe('17:00–18:30');
    await expect(page.locator('#sheet tbody tr:nth-child(1) td.c-date')).toContainText('17:00–18:30');
    // Shown, the Time column has the time picker itself, so the date picker doesn't offer it
    await page.evaluate(() => { state.columns.find((c) => c.key === 'time').visible = true; renderAll(); });
    await page.click('#sheet tbody tr:nth-child(1) td.c-date');
    await expect(page.locator('#pTime')).toHaveCount(0);
  });

  test('the tip under the program and the tour say what they should', async ({ page }) => {
    await expect(page.locator('.canvas-tip')).not.toContainText('highlight');
    await expect(page.locator('.canvas-tip')).toContainText('add, move or delete');
    const t = await page.evaluate(() => TOUR_DESKTOP.map((s) => s.text).join(' '));
    expect(t).toContain('bold, italic, colour and alignment');
    expect(t).toContain('in this browser only');
    await expect(page.locator('.sidebar-foot')).toContainText('in this browser only');
  });
});

test.describe('final touches (phone)', () => {
  const { defaultBrowserType, ...iPhone } = devices['iPhone 13'];
  test.use(iPhone);
  test('the menu says programs stay on this phone; the editor has the time with its column hidden', async ({ page }) => {
    const errors = await openApp(page);
    await page.click('#mMenu');
    await expect(page.locator('.m-panel:not([hidden]) .m-note')).toContainText('saved on this phone only');
    await page.click('.m-panel:not([hidden]) [data-panel-back]');
    await page.evaluate(() => { state.columns.find((c) => c.key === 'time').visible = false; renderAll(); });
    await page.locator('.m-row').first().click();
    await expect(page.locator('.m-panel:not([hidden]) [data-tm="start"]')).toHaveValue('18:15');
    expect(errors).toEqual([]);
  });
});
