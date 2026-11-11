// Files: spreadsheet, calendar, PDF and saved programs.
const fs = require('fs');
const { test, expect } = require('@playwright/test');
const { openApp, fillCubs, pdfPages, pdfPageSize } = require('./helpers');

async function save(page, kind) {
  await page.click('#btnExport');
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 60_000 }), page.click(`#popover [data-save="${kind}"]`)]);
  return dl;
}

test.describe('files', () => {
  let errors;
  test.beforeEach(async ({ page }) => { errors = await openApp(page); });
  test.afterEach(() => { expect(errors, 'browser errors').toEqual([]); });

  test('spreadsheet saves and opens back unchanged', async ({ page }, info) => {
    await page.evaluate(() => {
      Object.assign(state.rows[0], { activity: 'Night Walk, with "torches"', description: 'Line one\nLine two – en dash', challenge: 'outdoors', category: 'out', leader: 'Roo (Joeys)', red: ['time'] });
      Object.assign(state.rows[1], { date: '2026-10-24', endDate: '2026-10-25', time: '9 AM Sat\n4 PM Sun' });
      Object.assign(state.rows[3], { noMeeting: true, activity: 'No Cubs – Public holiday', time: '' });
      renderAll();
    });
    const snapshot = () => page.evaluate(() => JSON.stringify(state.rows.map(({ id, autoHoliday, ...r }) => r)));
    const before = await snapshot();
    const dl = await save(page, 'csv');
    expect(dl.suggestedFilename()).toBe('Cubs Program - Term 4 2026 - activities.csv');
    const file = info.outputPath('acts.csv');
    await dl.saveAs(file);
    expect(fs.readFileSync(file, 'utf8').charCodeAt(0)).toBe(0xfeff);
    await page.evaluate(() => { state.rows = []; renderAll(); });
    await page.click('#btnImport');
    await page.setInputFiles('#fileJson', file);
    await page.click('.modal [data-i="2"]');
    expect(await snapshot()).toBe(before);
  });

  test('a spreadsheet as Excel saves it opens correctly', async ({ page }, info) => {
    const file = info.outputPath('excel.csv');
    fs.writeFileSync(file, 'Date,Start / Finish Time,Activity,Challenge Area,No meeting\r\n13/10/2026,18:15-19:45,Knots,creative,\r\nSat or Sun 7 or 8 Nov,TBC,First Aid,,\r\n3/11/2026,,No Cubs - Cup Day,,yes\r\n');
    await page.click('#btnImport');
    await page.setInputFiles('#fileJson', file);
    await page.click('.modal [data-i="2"]');
    const rows = await page.evaluate(() => state.rows.map((r) => [r.date, r.dateLabel, r.activity, r.challenge, r.noMeeting]));
    expect(rows).toEqual([
      ['2026-10-13', '', 'Knots', 'creative', false],
      ['2026-11-03', '', 'No Cubs - Cup Day', '', true],
      ['2026-11-08', 'Sat or Sun 7 or 8 Nov', 'First Aid', '', false],
    ]);
  });

  test('calendar file has meetings, multi-day events and other dates', async ({ page }, info) => {
    await page.evaluate(() => {
      Object.assign(state.rows[0], { activity: 'Night Walk, with torches', where: 'Lions Park' });
      Object.assign(state.rows[1], { activity: 'Hike Camp', date: '2026-10-24', endDate: '2026-10-25', time: '9 AM Sat\n4 PM Sun' });
      state.extras.dates = [{ id: 'x1', what: 'Bunnings BBQ', when: '', date: '2026-11-06', endDate: '' }];
      renderAll();
    });
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#btnCalendar')]);
    const file = info.outputPath('cal.ics');
    await dl.saveAs(file);
    const ics = fs.readFileSync(file, 'utf8');
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(ics).toContain('SUMMARY:Cubs: Night Walk\\, with torches');
    expect(ics).toContain('LOCATION:Lions Park');
    expect(ics).toContain('DTSTART:20261024T090000\r\nDTEND:20261025T160000');
    expect(ics).toContain('DTSTART;VALUE=DATE:20261106\r\nDTEND;VALUE=DATE:20261107\r\nSUMMARY:Bunnings BBQ');
    expect(ics.split('\r\n').every((l) => Buffer.byteLength(l) <= 75)).toBe(true);
  });

  test('the app-made PDF is one landscape page', async ({ page }, info) => {
    await fillCubs(page);
    const dl = await save(page, 'pdf');
    const file = info.outputPath('program.pdf');
    await dl.saveAs(file);
    const pdf = fs.readFileSync(file);
    expect(pdfPages(pdf)).toBe(1);
    const [w, h] = pdfPageSize(pdf);
    expect(w).toBeGreaterThan(h);
  });

  test('the README example opens and fits one page', async ({ page }) => {
    await page.click('#btnImport');
    await page.setInputFiles('#fileJson', require('path').join(__dirname, '..', 'examples', 'example-program.json'));
    await expect(page.locator('#fitStatus')).toContainText('Fits 1 page');
    expect(await page.evaluate(() => [state.branding.groupName, state.rows.filter((r) => r.noMeeting).length, state.extras.dates.length]))
      .toEqual(['1st Wattle Creek Scout Group', 2, 3]);
  });

  test('programs: new next term, switch, duplicate, delete, survive reload', async ({ page }) => {
    await page.evaluate(() => { state.rows[0].activity = 'Kept'; renderAll(); });
    await page.click('#btnNew');
    await page.click('.modal [data-i="2"]');
    expect(await page.evaluate(() => `T${state.term.term} ${state.term.year}`)).toBe('T1 2027');
    await page.click('#btnPrograms');
    await page.click('[data-open]:has-text("Term 4 2026")');
    expect(await page.evaluate(() => state.rows[0].activity)).toBe('Kept');
    await page.click('#btnPrograms');
    await page.click('#pDupProg');
    expect(await page.evaluate(() => library.items.length)).toBe(3);
    await page.click('#btnPrograms');
    await page.click(`[data-delprog="${await page.evaluate(() => library.current)}"]`);
    await page.click('.modal .btn-danger');
    await page.reload();
    await page.waitForFunction(() => typeof library === 'object');
    expect(await page.evaluate(() => library.items.length)).toBe(2);
  });
});
