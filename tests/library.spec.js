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

/** Opens the Group library box: Move, under the programs list. */
async function libraryBox(page) {
  await page.click('#btnDirMove');
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
  // Nothing is written about it on the page: hovering a locked setting says why
  const fontField = page.locator('[data-bind="branding.font"]').first().locator('xpath=ancestor::*[contains(@class,"field")][1]');
  await expect(fontField).toHaveAttribute('title', /Set by 1st Example's styling\. Change it on the group site/);
  await expect(page.locator('.field.locked > span').first()).not.toContainText('the group');
  await expect(page.locator('#libraryStyleNote')).toHaveCount(0);
  await expect(page.locator('[data-bind="branding.titleTemplate"]').locator('xpath=ancestor::*[contains(@class,"field")][1]')).not.toHaveAttribute('title', /.*/);
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

test("moving in: a unit is chosen, one with the term's program already says so, and replacing it is asked first", async ({ page }) => {
  const server = await open(page);
  const term = await page.evaluate(() => `Term ${state.term.term} ${state.term.year}`);
  server.programs.get('lib22222').year = await page.evaluate(() => state.term.year);
  server.programs.get('lib22222').term = await page.evaluate(() => state.term.term);
  await page.evaluate(() => refreshPrograms());
  await libraryBox(page);
  // Nothing chosen to start with; Banksia has this term's program already
  await expect(page.locator('#moveTo')).toHaveValue('');
  await expect(page.locator('#moveTo option[value="group:g1|banksia"]')).toHaveText(`1st Example · Banksia Cubs: already has ${term}`);
  await expect(page.locator('#moveTo option[value="group:g1|banksia"]')).toHaveClass('taken');
  await expect(page.locator('#moveTo option[value="group:g1|mob"]')).toHaveText('1st Example · Mob');
  // Move with no unit chosen: asked to choose
  await page.click('.modal-actions button:has-text("Move")');
  await expect(page.locator('.toast').last()).toContainText('Choose the unit');
  // Banksia: asked first; cancelled, nothing moves
  await page.selectOption('#moveTo', 'group:g1|banksia');
  await page.click('.modal-actions button:has-text("Move")');
  await expect(page.locator('.modal h2')).toHaveText(`Replace Banksia Cubs's ${term} program?`);
  await expect(page.locator('.modal-body')).toContainText('Theirs goes to the bin');
  await page.click('.modal-actions button:has-text("Cancel")');
  expect(server.programs.get('prog1111').owner).toBe('me');
  // Again, replacing it: theirs to the bin, this one in its place
  await libraryBox(page);
  await page.selectOption('#moveTo', 'group:g1|banksia');
  await page.click('.modal-actions button:has-text("Move")');
  await page.click('.modal-actions button:has-text("Replace it")');
  await expect.poll(() => server.programs.get('prog1111').owner).toBe('group:g1');
  expect(server.programs.get('prog1111').unit).toBe('banksia');
  expect(server.programs.get('lib22222').deletedAt).toBeTruthy();
});

test('a leader given some units sees only those, and can move programs in but not out', async ({ page }) => {
  await open(page, { groups: [{ ...GROUP, role: 'leader' }] }, (server) => {
    server.libraries.set('g1', { units: UNITS, styling: STYLING, region: 'SA', myUnits: ['banksia'] });
    for (const id of ['lib33333']) server.programs.delete(id);   // the API lists only their units' programs
  });
  await expect(page.locator('.dir-unit-head')).toHaveText(['Banksia Cubs']);
  await libraryBox(page);
  await expect(page.locator('#moveTo option')).toHaveText(['Choose a unit…', /^1st Example · Banksia Cubs/]);
  await page.keyboard.press('Escape');
  await unit(page, 'banksia').locator('.term-tab.has').click();
  await expect(page.locator('#btnDirMove')).toBeHidden();   // only the group's owner and admins take one out
});

test('without the Group plan, terms with no program yet can\'t be started, and the box says so', async ({ page }) => {
  await open(page, { groups: [{ ...GROUP, plan: false }] });
  await expect(unit(page, 'mob').locator('.term-tab:not(.more)').first()).toBeDisabled();
  await libraryBox(page);
  await expect(page.locator('.modal-body')).toContainText("1st Example's library is part of the Group plan");
});

test('not in a group: no group in the menu, no move button, and no term tabs', async ({ page }) => {
  await open(page, { groups: [], programs: [program('prog1111', EXAMPLE, { version: 3 })] });
  await expect(page.locator('#btnDirMove')).toBeHidden();
  await page.click('#btnAccount');
  await expect(page.locator('[data-group-site]')).toHaveCount(0);
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

test.describe('opening a program file, with a plan', () => {
  const path = require('path');
  const fs = require('fs');
  /** The example, saved by another group: its own name, colours and spaces, and Term 1 2027. */
  const otherGroupFile = (dir) => {
    const data = { ...EXAMPLE, unit: 'theirs', branding: { ...EXAMPLE.branding, groupName: 'Another Group', color: '#123456', font: 'Arial' },
      rows: EXAMPLE.rows.map((r, i) => (i === 1 ? { ...r, space: 'theirHall', where: 'Their hall' } : r)) };
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, 'other-group.json');
    fs.writeFileSync(file, JSON.stringify(data));
    return file;
  };

  test("goes only into a unit's term: started for it, with the group's styling, not the file's", async ({ page }, info) => {
    const server = await open(page);
    await page.click('#btnImport');
    await page.setInputFiles('#fileJson', otherGroupFile(info.outputDir));
    await expect(page.locator('.modal h2')).toHaveText('Open this program into');
    // Only units' terms: no new program of their own, nor the open one as such
    const choices = await page.locator('#openInto option').allTextContents();
    expect(choices.every((c) => /^Term \d \d{4} \((replaces its program|starts it)\)$/.test(c))).toBe(true);
    await expect(page.locator('#openInto optgroup')).toHaveCount(3);
    await page.selectOption('#openInto', 'group:g1|wattle|2027|2');
    await page.click('.modal-actions button:has-text("Open")');
    await expect.poll(() => [...server.programs.values()].filter((p) => p.unit === 'wattle' && p.term === 2).length).toBe(1);
    const made = [...server.programs.values()].find((p) => p.unit === 'wattle' && p.term === 2);
    await expect.poll(() => server.programs.get(made.id).data.rows.some((r) => r.activity === EXAMPLE.rows.find((x) => !x.noMeeting && !x.autoHoliday).activity)).toBe(true);
    const data = server.programs.get(made.id).data;
    // The group's styling and the unit's name; the chosen unit and term, not the file's
    expect(data.branding).toMatchObject({ groupName: '1st Example', font: 'Lexend', color: '#0B6E4F', sectionName: 'Wattle Cubs' });
    expect([data.unit, data.term.year, data.term.term]).toEqual(['wattle', 2027, 2]);
    // Its activities on Term 2's nights; the other group's space kept as a place, by name
    const week = 7 * 86_400_000, at = (d) => Date.parse(d);
    expect(data.rows.every((r) => !r.date || (at(r.date) >= at(data.term.start) - week && at(r.date) <= at(data.term.end) + week))).toBe(true);
    expect(data.term.start.startsWith('2027-04')).toBe(true);
    expect(data.rows.some((r) => r.where === 'Their hall' && !r.space)).toBe(true);
    // Nothing of their own was added
    expect(server.live().filter((p) => p.owner === 'me')).toHaveLength(1);
  });

  test("into a term that has a program: that program's contents are replaced", async ({ page }, info) => {
    const server = await open(page);
    await page.click('#btnImport');
    await page.setInputFiles('#fileJson', otherGroupFile(info.outputDir));
    await page.selectOption('#openInto', 'group:g1|banksia|2027|1');
    await page.click('.modal-actions button:has-text("Open")');
    await expect.poll(() => page.evaluate(() => library.current)).toBe('lib22222');
    await expect.poll(() => server.programs.get('lib22222').version).toBeGreaterThan(2);
    expect(server.programs.get('lib22222').data.branding.groupName).toBe('1st Example');
    expect(server.programs.size).toBe(4);   // nothing added
  });
});

test.describe('several groups', () => {
  const OTHER = { id: 'g2', name: '2nd Example', role: 'leader', gearRole: 'leader', plan: true };
  const otherProgram = program('lib55555', { ...EXAMPLE, unit: 'kingfisher' }, { name: 'Kingfisher T1', owner: 'group:g2', unit: 'kingfisher', version: 1, year: 2027, term: 1 });

  test('the bar switches the group in view: its library, its address, and the group every call says it is for', async ({ page }) => {
    const server = await open(page, { groups: [GROUP, OTHER] }, (s) => {
      s.programs.set(otherProgram.id, otherProgram);
      s.libraries.set('g2', { units: [{ id: 'kingfisher', name: 'Kingfisher Troop', section: 'scouts' }], styling: null, region: 'SA' });
    });
    // The first group, with its address
    await expect(page.locator('#groupSwitch')).toBeVisible();
    await expect(page.locator('#groupSwitch .qs-group-name')).toHaveText('1st Example');
    await expect(page.locator('.appbar .brand-text')).toBeHidden();
    await expect(page).toHaveURL(/\/g\/g1\/$/);
    const lib = page.locator('.dir-group:has(.dir-library)');
    await expect(lib.locator('.dir-head')).toContainText("1st Example's library");
    // To the other: its library, not the first's; their own programs stay
    await page.click('#groupSwitch .qs-group-btn');
    await expect(page.locator('#groupSwitch .qs-switch-name')).toHaveText(['My programs', '1st Example', '2nd Example', 'Start or join a group']);
    await page.click('#groupSwitch [data-group="g2"]');
    await expect(page).toHaveURL(/\/g\/g2\/$/);
    await expect(lib.locator('.dir-head')).toContainText("2nd Example's library");
    await expect(lib.locator('.dir-unit-head')).toHaveText(['Kingfisher Troop']);
    await expect(page.locator('.dir-group:not(:has(.dir-library)) .dir-item b')).toHaveText([/Cubs Program/]);
    await unit(page, 'kingfisher').locator('.term-tab.has').click();
    await expect.poll(() => page.evaluate(() => library.current)).toBe('lib55555');
    expect(server.scopes).toContain('GET /programs/lib55555 g2');
    expect(server.scopes).toContain('GET /groups/g2/library g2');
    expect(server.scopes.filter((x) => /\/groups\/g\d|owner=group/.test(x) && x.endsWith(' -'))).toEqual([]);
    // Shared with qStored's other apps
    const cookie = (await page.context().cookies()).find((c) => c.name === 'qstored_group');
    expect(JSON.parse(decodeURIComponent(cookie.value)).gid).toBe('g2');
    // "My programs": their own only, at the site's root
    await page.click('#groupSwitch .qs-group-btn');
    await page.click('#groupSwitch [data-group=""]');
    await expect(page).toHaveURL(/localhost:\d+\/$/);
    await expect(lib).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => library.current)).toBe('prog1111');
  });

  test("a group's address opens that group", async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-11-18T10:00:00+10:30'));
    const server = await mockAccount(page, { signedIn: true, groups: [GROUP, OTHER], programs: [program('prog1111', EXAMPLE, { version: 3 }), otherProgram] });
    server.libraries.set('g2', { units: [{ id: 'kingfisher', name: 'Kingfisher Troop', section: 'scouts' }], styling: null, region: 'SA' });
    errors = await openAccountApp(page, SIGN_IN_LINK);
    await expect(page.locator('#groupSwitch .qs-group-name')).toHaveText('1st Example');
    await page.goto('/g/g2/');
    await page.waitForFunction(() => typeof state === 'object');
    await expect(page.locator('#groupSwitch .qs-group-name')).toHaveText('2nd Example');
    await expect(page).toHaveURL(/\/g\/g2\/$/);
    await expect(page.locator('.dir-group:has(.dir-library) .dir-head')).toContainText("2nd Example's library");
  });
});
