// A group's library (the Group plan): programs kept by the group under its units, with the group's styling, which
// is set on the group site and locked here. The API is stood in for by tests/account-helpers.js.
const { test, expect } = require('@playwright/test');
const { program, mockAccount, openAccountApp, SIGN_IN_LINK } = require('./account-helpers');

const EXAMPLE = require('../examples/example-program.json');
const GROUP = { id: 'g1', name: '1st Example', role: 'owner', gearRole: 'quartermaster', plan: true };
const UNITS = [
  { id: 'wattle', name: 'Wattle Cubs', section: 'cubs' }, { id: 'mob', name: 'Mob', section: 'joeys' },
  { id: 'banksia', name: 'Banksia Cubs', section: 'cubs' },
];
const STYLING = { shared: { groupName: '1st Example', font: 'Lexend', headerStyle: 'solid' }, sections: { cubs: { color: '#0B6E4F' } } };
const inUnit = (id, unit, name) => program(id, { ...EXAMPLE, unit }, { name, owner: 'group:g1', unit, version: 2 });

let errors;
test.afterEach(() => { expect(errors, 'browser errors').toEqual([]); });

async function open(page, options = {}, setUp = () => {}) {
  const server = await mockAccount(page, {
    signedIn: true, groups: [GROUP],
    programs: [program('prog1111', EXAMPLE, { version: 3 }), inUnit('lib22222', 'banksia', 'Banksia T1'), inUnit('lib33333', 'wattle', 'Wattle T1')],
    ...options,
  });
  server.libraries.set('g1', { units: UNITS, styling: STYLING });
  setUp(server);
  errors = await openAccountApp(page, SIGN_IN_LINK);
  await expect.poll(async () => server.programs.has(await page.evaluate(() => library.current))).toBe(true);
  await page.evaluate(() => openProgram('prog1111'));
  await expect.poll(() => page.evaluate(() => library.current)).toBe('prog1111');
  return server;
}

/** Opens the Group library box from the account menu. */
async function libraryBox(page) {
  await page.click('#btnAccount');
  await page.click('#pLibrary');
  await expect(page.locator('.modal h2')).toHaveText("The group's library");
}

test("the library's programs are listed under their units, in the sections' order, and don't count towards the free 3", async ({ page }) => {
  await open(page, { limit: 1 });
  const lib = page.locator('.dir-group:has(.dir-library)');
  await expect(lib.locator('.dir-head')).toContainText("1st Example's library");
  // Cubs units (Banksia before Wattle), each with its program; Mob has none, so it isn't listed
  await expect(lib.locator('.dir-unit-head')).toHaveText(['Banksia Cubs', 'Wattle Cubs']);
  await expect(lib.locator('.dir-unit').nth(0).locator('.dir-item b')).toHaveText([/Banksia T1|Banksia Cubs/]);
  await expect(lib.locator('.dir-unit').nth(1).locator('.dir-item b')).toHaveText([/Wattle T1|Wattle Cubs/]);
  await expect(page.locator('.dir-group:not(:has(.dir-library)) .dir-item b')).toHaveText([/Cubs Program/]);
});

test("a library program has the group's styling and its unit's name, locked; the leader's own isn't", async ({ page }) => {
  const server = await open(page);
  await expect(page.locator('[data-bind="branding.font"]')).toBeEnabled();
  await expect(page.locator('#libraryStyleNote')).toBeHidden();
  await page.locator('.dir-item[data-open="lib22222"]').click();
  await expect.poll(() => page.evaluate(() => library.current)).toBe('lib22222');
  expect(await page.evaluate(() => ({ ...state.branding, logo: undefined, leaders: undefined }))).toMatchObject({
    font: 'Lexend', headerStyle: 'solid', groupName: '1st Example', color: '#0B6E4F', section: 'cubs', sectionName: 'Banksia Cubs',
  });
  await expect(page.locator('#sheet')).toContainText('Banksia Cubs');
  for (const bind of ['font', 'headerStyle', 'groupName', 'color', 'section', 'sectionName']) {
    await expect(page.locator(`[data-bind="branding.${bind}"]`).first()).toBeDisabled();
  }
  // What the group hasn't set stays the leader's
  await expect(page.locator('[data-bind="branding.titleTemplate"]')).toBeEnabled();
  await expect(page.locator('[data-bind="branding.footerText"]')).toBeEnabled();
  await expect(page.locator('#libraryStyleNote')).toContainText("1st Example's styling is on this program");
  // Changes the group makes on the group site arrive when the builder catches up
  server.libraries.set('g1', { units: UNITS, styling: { ...STYLING, shared: { ...STYLING.shared, font: 'Inter' } } });
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await expect.poll(() => page.evaluate(() => state.branding.font)).toBe('Inter');
});

test('a new program is kept where the leader chooses: their own, or one of the group\'s units, with its styling', async ({ page }) => {
  const server = await open(page, { limit: 1 });
  await page.click('#btnDirNew');
  await expect(page.locator('.modal h2')).toHaveText('Start a new program');
  await expect(page.locator('#newPlace option')).toHaveText(['My programs', '1st Example · Mob', '1st Example · Banksia Cubs', '1st Example · Wattle Cubs']);
  await expect(page.locator('#newPlace')).toHaveValue('me');
  await page.selectOption('#newPlace', 'group:g1|mob');
  await page.click('.modal-actions .btn-primary');
  await expect.poll(() => [...server.programs.values()].filter((p) => p.unit === 'mob').length).toBe(1);
  const made = [...server.programs.values()].find((p) => p.unit === 'mob');
  expect(made.owner).toBe('group:g1');
  expect(made.data.branding).toMatchObject({ section: 'joeys', sectionName: 'Mob', font: 'Lexend' });
  await expect(page.locator('.dir-unit-head')).toHaveText(['Mob', 'Banksia Cubs', 'Wattle Cubs']);
  // From a library program, the next starts in the same unit
  await page.click('#btnDirNew');
  await expect(page.locator('#newPlace')).toHaveValue('group:g1|mob');
  await page.keyboard.press('Escape');
  // A free account with one program of its own can't start another of its own
  await page.click('#btnDirNew');
  await page.selectOption('#newPlace', 'me');
  await page.click('.modal-actions .btn-primary');
  await expect(page.locator('.modal h2')).toHaveText('A free account keeps 1 programs');
});

test("a leader's own program moves into a unit, and the owner takes it out again", async ({ page }) => {
  const server = await open(page);
  await libraryBox(page);
  await expect(page.locator('.modal-body')).toContainText('This program is yours');
  await page.selectOption('#moveTo', 'group:g1|wattle');
  await page.click('.modal-actions button:has-text("Move")');
  await expect.poll(() => server.programs.get('prog1111').owner).toBe('group:g1');
  expect(server.programs.get('prog1111').unit).toBe('wattle');
  await expect(page.locator('.dir-unit').nth(1).locator('.dir-item b')).toHaveCount(2);
  expect(await page.evaluate(() => state.branding.sectionName)).toBe('Wattle Cubs');
  await libraryBox(page);
  await expect(page.locator('.modal-body')).toContainText("This program is in 1st Example's library, for Wattle Cubs");
  await page.click('.modal-actions button:has-text("Move to my programs")');
  await expect.poll(() => server.programs.get('prog1111').owner).toBe('me');
  await expect(page.locator('[data-bind="branding.font"]')).toBeEnabled();
});

test('a leader (not the owner or an admin) can move programs in, but not out', async ({ page }) => {
  await open(page, { groups: [{ ...GROUP, role: 'leader' }] });
  await page.locator('.dir-item[data-open="lib22222"]').click();
  await libraryBox(page);
  await expect(page.locator('.modal-actions button:has-text("Move to my programs")')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(page.locator('#libraryStyleNote')).toContainText("by the group's owner and admins");
});

test('without the Group plan, the box says so, and offers no move', async ({ page }) => {
  await open(page, { groups: [{ ...GROUP, plan: false }] });
  await libraryBox(page);
  await expect(page.locator('.modal-body')).toContainText("1st Example's library is part of the Group plan");
  await expect(page.locator('.modal-actions button:has-text("Move")')).toHaveCount(0);
});

test('not in a group: the menu has no Group library, and New program asks nothing more', async ({ page }) => {
  await open(page, { groups: [], programs: [program('prog1111', EXAMPLE, { version: 3 })] });
  await page.click('#btnAccount');
  await expect(page.locator('#pLibrary')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await page.click('#btnDirNew');
  await expect(page.locator('.modal h2')).toHaveText('Start a new program');
  await expect(page.locator('#newPlace')).toHaveCount(0);
});
