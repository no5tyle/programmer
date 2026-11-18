// A group's library (the Group plan): programs kept by the group, and the group's styling for new programs.
// The API is stood in for by tests/account-helpers.js.
const { test, expect } = require('@playwright/test');
const { program, mockAccount, openAccountApp, SIGN_IN_LINK } = require('./account-helpers');

const EXAMPLE = require('../examples/example-program.json');
const GROUP = { id: 'g1', name: '1st Example', role: 'owner', gearRole: 'quartermaster', plan: true };

let errors;
test.afterEach(() => { expect(errors, 'browser errors').toEqual([]); });

async function open(page, options = {}) {
  const server = await mockAccount(page, {
    signedIn: true, groups: [GROUP],
    programs: [program('prog1111', EXAMPLE, { version: 3 }), program('lib22222', EXAMPLE, { name: 'Library Cubs', owner: 'group:g1', version: 2 })],
    ...options,
  });
  errors = await openAccountApp(page, SIGN_IN_LINK);
  await expect.poll(async () => server.programs.has(await page.evaluate(() => library.current))).toBe(true);
  return server;
}

/** Opens the Group library box from the account menu. */
async function libraryBox(page) {
  await page.click('#btnAccount');
  await page.click('#pLibrary');
  await expect(page.locator('.modal h2')).toHaveText("The group's library");
}

test("the library's programs are listed under the group, and don't count towards the free 3", async ({ page }) => {
  const server = await open(page, { limit: 1 });
  const lib = page.locator('.dir-group:has(.dir-library)');
  await expect(lib.locator('.dir-head')).toContainText("1st Example's library");
  await expect(lib.locator('.dir-item b')).toHaveText(['Library Cubs']);
  await expect(page.locator('.dir-group:not(:has(.dir-library)) .dir-item b')).toHaveText([/Cubs Program/]);
  // Opened and changed like any other
  await lib.locator('.dir-item').click();
  await expect.poll(() => page.evaluate(() => library.current)).toBe('lib22222');
  await page.evaluate(() => { state.rows[0].activity = 'Library night'; renderDoc(); saveSoon(); });
  await expect.poll(() => server.programs.get('lib22222').data.rows[0].activity).toBe('Library night');
  expect(server.programs.get('lib22222').owner).toBe('group:g1');
  // A free account with one program of its own still starts another in the library
  await page.click('#btnDirNew');
  await expect(page.locator('.modal h2')).toHaveText('Start a new program');
  await expect(page.locator('.modal-body')).toContainText("It's kept in 1st Example's library");
  await page.click('.modal-actions .btn-primary');
  await expect.poll(() => [...server.programs.values()].filter((p) => p.owner === 'group:g1').length).toBe(2);
});

test("a leader's own program moves into the library, and the owner takes it out again", async ({ page }) => {
  const server = await open(page);
  await libraryBox(page);
  await expect(page.locator('.modal-body')).toContainText('This program is yours');
  await page.click('.modal-actions button:has-text("Move to the group\'s library")');
  await expect.poll(() => server.programs.get('prog1111').owner).toBe('group:g1');
  await expect(page.locator('.dir-group:has(.dir-library) .dir-item b')).toHaveText([/Cubs Program/, 'Library Cubs']);
  await libraryBox(page);
  await expect(page.locator('.modal-body')).toContainText("This program is in 1st Example's library");
  await page.click('.modal-actions button:has-text("Move to my programs")');
  await expect.poll(() => server.programs.get('prog1111').owner).toBe('me');
  await expect(page.locator('.dir-group:has(.dir-library) .dir-item b')).toHaveText(['Library Cubs']);
});

test('a leader (not the owner or an admin) can move programs in, but not out', async ({ page }) => {
  await open(page, { groups: [{ ...GROUP, role: 'leader' }] });
  await page.locator('.dir-item:has-text("Library Cubs")').click();
  await libraryBox(page);
  await expect(page.locator('.modal-actions button:has-text("Move to my programs")')).toHaveCount(0);
  await expect(page.locator('.modal-actions button:has-text("Save as the group\'s styling")')).toHaveCount(0);
});

test("the group's styling: saved from a program, then new programs start with it", async ({ page }) => {
  const server = await open(page);
  await page.evaluate(() => { state.branding.font = 'Merriweather'; state.branding.leaders = [{ name: 'Akela', phone: '0400 111 222' }]; save(); });
  await libraryBox(page);
  await expect(page.locator('.modal-body')).toContainText("1st Example's styling: not saved yet");
  await page.click('.modal-actions button:has-text("Save as the group\'s styling")');
  await expect.poll(() => server.defaults.get('g1')?.data?.sections?.cubs?.branding?.leaders).toEqual([{ name: 'Akela', phone: '0400 111 222' }]);
  expect(server.defaults.get('g1').data.shared.branding.font).toBe('Merriweather');

  // Another program, styled differently: a new one starts with the group's
  await page.evaluate(() => { state.branding.font = 'Nunito'; state.branding.leaders = []; save(); });
  await page.click('#btnDirNew');
  await expect(page.locator('#newStyled')).toBeChecked();
  await expect(page.locator('.modal-body')).toContainText("Start with 1st Example's styling, leaders and patrols");
  await page.click('.modal-actions .btn-primary');
  await expect(page.locator('#toasts')).toContainText("Started with 1st Example's styling");
  expect(await page.evaluate(() => [state.branding.font, state.branding.leaders.map((l) => l.name)])).toEqual(['Merriweather', ['Akela']]);

  // And it can be put on an existing program, with Undo to take it off
  await page.evaluate(() => { state.branding.font = 'Nunito'; save(); });
  await libraryBox(page);
  await page.click('.modal-actions button:has-text("Use the group\'s styling")');
  expect(await page.evaluate(() => state.branding.font)).toBe('Merriweather');
  await page.click('#btnUndo');
  expect(await page.evaluate(() => state.branding.font)).toBe('Nunito');
});

test("without the Group plan, the box says so, and offers no move", async ({ page }) => {
  await open(page, { groups: [{ ...GROUP, plan: false }] });
  await libraryBox(page);
  await expect(page.locator('.modal-body')).toContainText("1st Example's library is part of the Group plan");
  await expect(page.locator('.modal-actions button:has-text("Move")')).toHaveCount(0);
});

test('not in a group: the menu has no Group library', async ({ page }) => {
  await open(page, { groups: [], programs: [program('prog1111', EXAMPLE, { version: 3 })] });
  await page.click('#btnAccount');
  await expect(page.locator('#pAccount')).toBeVisible();
  await expect(page.locator('#pLibrary')).toHaveCount(0);
});
