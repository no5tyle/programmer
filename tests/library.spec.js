// A group's library (the Group plan): one program a term for each unit, shown as a tab for each of its coming terms,
// with the group's styling (set on the group site, locked here); a past term's program is kept as it was.
// The API is stood in for by tests/account-helpers.js. The page's clock is fixed at 18 November 2026, so the terms
// shown (SA's) are Term 4 2026 to Term 3 2027.
const { test, expect } = require('@playwright/test');
const { program, mockAccount, openAccountApp, SIGN_IN_LINK } = require('./account-helpers');

const EXAMPLE = require('../examples/example-program.json');   // Cubs, Term 1 2027 (SA)
const GROUP = { id: 'g1', name: '1st Example', role: 'owner', gearRole: 'quartermaster', plan: true };
const UNITS = [
  { id: 'wattle', name: 'Wattle Cubs', section: 'cubs' }, { id: 'mob', name: 'Mob', section: 'joeys' },
  { id: 'banksia', name: 'Banksia Cubs', section: 'cubs' },
];
const STYLING = { shared: { groupName: '1st Example', font: 'Lexend', headerStyle: 'solid' }, sections: { cubs: { color: '#0B6E4F' } } };
const inUnit = (id, unit, name, term = EXAMPLE.term) =>
  program(id, { ...EXAMPLE, unit, term }, { name, owner: 'group:g1', unit, version: 2, year: term.year, term: term.term });
const PAST_TERM = { ...EXAMPLE.term, year: 2025, term: 4, start: '2025-10-13', end: '2025-12-12' };
const TABS = ['T4 26', 'T1 27', 'T2 27', 'T3 27', '…'];

let errors;
test.afterEach(() => { expect(errors, 'browser errors').toEqual([]); });

async function open(page, options = {}, setUp = () => {}) {
  await page.clock.setFixedTime(new Date('2026-11-18T10:00:00+10:30'));
  const server = await mockAccount(page, {
    signedIn: true, groups: [GROUP],
    programs: [program('prog1111', EXAMPLE, { version: 3 }), inUnit('lib22222', 'banksia', 'Banksia T1'), inUnit('lib33333', 'wattle', 'Wattle T1'),
      inUnit('old44444', 'banksia', 'Banksia last year', PAST_TERM)],
    ...options,
  });
  server.libraries.set('g1', { units: UNITS, styling: STYLING, region: 'SA' });
  setUp(server);
  errors = await openAccountApp(page, SIGN_IN_LINK);
  await expect.poll(async () => server.programs.has(await page.evaluate(() => library.current))).toBe(true);
  await page.evaluate(() => openProgram('prog1111'));
  await expect.poll(() => page.evaluate(() => library.current)).toBe('prog1111');
  return server;
}
const unit = (page, id) => page.locator(`.dir-unit[data-unit="${id}"]`);

/** Opens the Group library box from the account menu. */
async function libraryBox(page) {
  await page.click('#btnAccount');
  await page.click('#pLibrary');
  await expect(page.locator('.modal h2')).toHaveText("The group's library");
}

test('each unit shows a tab for each of its next four terms, in the sections\' order, and they don\'t count towards the free 3', async ({ page }) => {
  await open(page, { limit: 1 });
  const lib = page.locator('.dir-group:has(.dir-library)');
  await expect(lib.locator('.dir-head')).toContainText("1st Example's library");
  await expect(lib.locator('.dir-unit-head')).toHaveText(['Mob', 'Banksia Cubs', 'Wattle Cubs']);
  for (const u of ['mob', 'banksia', 'wattle']) await expect(unit(page, u).locator('.term-tab')).toHaveText(TABS.map((t, i) => (i < 4 ? new RegExp(t) : t)));
  // Banksia and Wattle have Term 1 2027; the rest are still to start
  await expect(unit(page, 'banksia').locator('.term-tab.has')).toHaveText(['T1 27']);
  await expect(unit(page, 'mob').locator('.term-tab.has')).toHaveCount(0);
  await unit(page, 'banksia').locator('.term-tab.has').click();
  await expect.poll(() => page.evaluate(() => library.current)).toBe('lib22222');
  await expect(unit(page, 'banksia').locator('.term-tab[aria-current]')).toHaveText('T1 27');
  // The leader's own programs, as ever
  await expect(page.locator('.dir-group:not(:has(.dir-library)) .dir-item b')).toHaveText([/Cubs Program/]);
});

test("starting a term: ready to fill in, carried on from the unit's last program, with the term's dates and the group's styling", async ({ page }) => {
  const server = await open(page, { limit: 1 });
  await unit(page, 'banksia').locator('.term-tab:has-text("T2 27")').click();
  await expect.poll(() => [...server.programs.values()].filter((p) => p.unit === 'banksia').length).toBe(3);
  const made = [...server.programs.values()].find((p) => p.unit === 'banksia' && p.term === 2);
  expect(made).toMatchObject({ owner: 'group:g1', year: 2027 });
  expect(made.data.term).toMatchObject({ region: 'SA', year: 2027, term: 2, start: '2027-04-26', end: '2027-07-02' });
  expect(made.data.rows.length).toBeGreaterThan(5);
  expect(made.data.rows.every((r) => !r.activity || r.noMeeting)).toBe(true);   // fresh meeting nights
  expect(made.data.branding.leaders.map((l) => l.name)).toEqual(EXAMPLE.branding.leaders.map((l) => l.name));
  expect(made.data.branding).toMatchObject({ font: 'Lexend', sectionName: 'Banksia Cubs' });
  await expect(unit(page, 'banksia').locator('.term-tab[aria-current]')).toHaveText('T2 27');
  // A unit with no program yet starts from its section
  await unit(page, 'mob').locator('.term-tab:has-text("T4 26")').click();
  await expect.poll(() => [...server.programs.values()].find((p) => p.unit === 'mob')?.data.branding.section).toBe('joeys');
});

test('if another leader started the term first, theirs is opened instead', async ({ page }) => {
  const server = await open(page);
  // Made on another device after this one loaded the list
  server.programs.set('theirs55', inUnit('theirs55', 'wattle', 'Theirs', { ...EXAMPLE.term, term: 2, start: '2027-04-26', end: '2027-07-02' }));
  await unit(page, 'wattle').locator('.term-tab:has-text("T2 27")').click();
  await expect(page.locator('#toasts')).toContainText('term_taken');   // the API's own words, from the stand-in
  await expect.poll(() => page.evaluate(() => library.current)).toBe('theirs55');
  expect([...server.programs.values()].filter((p) => p.unit === 'wattle' && p.term === 2)).toHaveLength(1);
});

test("More: the unit's earlier programs, kept as they were, and its later terms", async ({ page }) => {
  const server = await open(page);
  await unit(page, 'banksia').locator('.term-tab.more').click();
  await expect(page.locator('.pop-title')).toHaveText('Banksia Cubs');
  await expect(page.locator('.prog-open b')).toHaveText(['Term 4 2027', 'Term 1 2028', 'Term 2 2028', 'Term 3 2028', 'Term 4 2025']);
  await expect(page.locator('.prog-open:has-text("Term 4 2025") span')).toHaveText('Ended: read only');
  await page.click('.prog-open:has-text("Term 4 2025")');
  await expect.poll(() => page.evaluate(() => library.current)).toBe('old44444');
  await expect(page.locator('body')).toHaveClass(/read-only/);
  await expect(page.locator('#readOnlyNote')).toContainText('Term 4 2025 has ended, so this program is kept as it was');
  await expect(page.locator('#btnAddRow')).toBeHidden();
  // A change is put back, not saved
  const puts = server.called('PUT').length;
  await page.evaluate(() => { state.rows[0].activity = 'Changed'; save(); });
  await expect(page.locator('#toasts')).toContainText('This term has ended');
  expect(await page.evaluate(() => state.rows[0].activity)).not.toBe('Changed');
  expect(server.called('PUT')).toHaveLength(puts);
  // Printing and exporting still work
  await expect(page.locator('#btnExport')).toBeEnabled();
  // Back to a term that's on: editable again
  await unit(page, 'banksia').locator('.term-tab.has').click();
  await expect(page.locator('body')).not.toHaveClass(/read-only/);
});

test("a library program has the group's styling and its unit's name, locked; the leader's own isn't", async ({ page }) => {
  const server = await open(page);
  await expect(page.locator('[data-bind="branding.font"]')).toBeEnabled();
  await unit(page, 'banksia').locator('.term-tab.has').click();
  await expect.poll(() => page.evaluate(() => library.current)).toBe('lib22222');
  expect(await page.evaluate(() => ({ ...state.branding, logo: undefined, leaders: undefined }))).toMatchObject({
    font: 'Lexend', headerStyle: 'solid', groupName: '1st Example', color: '#0B6E4F', section: 'cubs', sectionName: 'Banksia Cubs',
  });
  for (const bind of ['font', 'headerStyle', 'groupName', 'color', 'section', 'sectionName']) {
    await expect(page.locator(`[data-bind="branding.${bind}"]`).first()).toBeDisabled();
  }
  await expect(page.locator('[data-bind="branding.titleTemplate"]')).toBeEnabled();
  await expect(page.locator('#libraryStyleNote')).toContainText("1st Example's styling is on this program");
  server.libraries.set('g1', { units: UNITS, styling: { ...STYLING, shared: { ...STYLING.shared, font: 'Inter' } }, region: 'SA' });
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await expect.poll(() => page.evaluate(() => state.branding.font)).toBe('Inter');
});

test("New program is the leader's own; a group's programs come from its term tabs", async ({ page }) => {
  await open(page);
  await page.click('#btnDirNew');
  await expect(page.locator('.modal h2')).toHaveText('Start a new program');
  await expect(page.locator('#newPlace')).toHaveCount(0);
});

test("a leader's own program moves into one of their units, and the owner takes it out again", async ({ page }) => {
  const server = await open(page);
  server.programs.get('prog1111').data = { ...EXAMPLE, term: { ...EXAMPLE.term, term: 3, start: '2027-07-19', end: '2027-09-24' } };
  await libraryBox(page);
  await expect(page.locator('.modal-body')).toContainText('This program is yours');
  await page.selectOption('#moveTo', 'group:g1|mob');
  await page.click('.modal-actions button:has-text("Move")');
  await expect.poll(() => server.programs.get('prog1111').owner).toBe('group:g1');
  expect(server.programs.get('prog1111').unit).toBe('mob');
  await libraryBox(page);
  await expect(page.locator('.modal-body')).toContainText("This program is in 1st Example's library, for Mob");
  await page.click('.modal-actions button:has-text("Move to my programs")');
  await expect.poll(() => server.programs.get('prog1111').owner).toBe('me');
});

test('a leader given some units sees only those, and can move programs in but not out', async ({ page }) => {
  await open(page, { groups: [{ ...GROUP, role: 'leader' }] }, (server) => {
    server.libraries.set('g1', { units: UNITS, styling: STYLING, region: 'SA', myUnits: ['banksia'] });
    for (const id of ['lib33333']) server.programs.delete(id);   // the API lists only their units' programs
  });
  await expect(page.locator('.dir-unit-head')).toHaveText(['Banksia Cubs']);
  await libraryBox(page);
  await expect(page.locator('#moveTo option')).toHaveText(['1st Example · Banksia Cubs']);
  await page.keyboard.press('Escape');
  await unit(page, 'banksia').locator('.term-tab.has').click();
  await libraryBox(page);
  await expect(page.locator('.modal-actions button:has-text("Move to my programs")')).toHaveCount(0);
});

test('without the Group plan, terms with no program yet can\'t be started, and the box says so', async ({ page }) => {
  await open(page, { groups: [{ ...GROUP, plan: false }] });
  await expect(unit(page, 'mob').locator('.term-tab:not(.more)').first()).toBeDisabled();
  await libraryBox(page);
  await expect(page.locator('.modal-body')).toContainText("1st Example's library is part of the Group plan");
});

test('not in a group: the menu has no Group library, and there are no term tabs', async ({ page }) => {
  await open(page, { groups: [], programs: [program('prog1111', EXAMPLE, { version: 3 })] });
  await page.click('#btnAccount');
  await expect(page.locator('#pLibrary')).toHaveCount(0);
  await expect(page.locator('.term-tab')).toHaveCount(0);
});

test('on a phone, the programs menu has the units and their term tabs too', async ({ browser }) => {
  const { devices } = require('@playwright/test');
  const context = await browser.newContext({ ...devices['iPhone 13'] });
  const page = await context.newPage();
  await open(page);
  await page.click('#mTitle');
  await expect(page.locator('.pop-library .dir-unit-head')).toHaveText(['Mob', 'Banksia Cubs', 'Wattle Cubs']);
  await page.locator('.pop-library .dir-unit[data-unit="banksia"] .term-tab.has').click();
  await expect.poll(() => page.evaluate(() => library.current)).toBe('lib22222');
  await context.close();
});
