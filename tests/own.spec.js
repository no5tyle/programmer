// A person's own programs, by their plan: one without a plan; their own units with an Individual plan; read only
// with only a group's Group plan. And with no program open, the page says how to start one.
const { test, expect } = require('@playwright/test');
const { program, mockAccount, openAccountApp, SIGN_IN_LINK } = require('./account-helpers');
const { openApp } = require('./helpers');

const EXAMPLE = require('../examples/example-program.json');   // Cubs, Term 1 2027 (SA)
const GROUP = { id: 'g1', name: '1st Example', role: 'leader', gearRole: 'leader', plan: true };

let errors;
test.afterEach(() => { expect(errors, 'browser errors').toEqual([]); });

async function signedIn(page, options = {}, setUp = () => {}) {
  await page.clock.setFixedTime(new Date('2026-11-18T10:00:00+10:30'));
  // Been here before (a first visit starts with a program and the set-up questions)
  await page.addInitScript(() => { if (!localStorage.getItem('scoutProgramBuilder.library.v1')) localStorage.setItem('scoutProgramBuilder.library.v1', JSON.stringify({ current: null, items: [] })); });
  const server = await mockAccount(page, { signedIn: true, programs: [], ...options });
  setUp(server);
  errors = await openAccountApp(page, SIGN_IN_LINK);
  return server;
}

test.describe('no program open', () => {
  test('signed in with none, the page offers to start one, and nothing is made until then', async ({ page }) => {
    const server = await signedIn(page, { programs: [] });
    await expect(page.locator('#emptyState h2')).toHaveText('No program yet');
    await expect(page.locator('body')).toHaveClass(/no-program/);
    await expect(page.locator('#sheet')).toBeHidden();
    await page.waitForTimeout(400);
    expect(server.called('POST /programs')).toEqual([]);
    await page.click('#emptyState [data-empty="start"]');
    await expect(page.locator('.wz')).toBeVisible();   // the set-up questions
    await expect(page.locator('body')).not.toHaveClass(/no-program/);
  });

  test('deleting the last program leaves none, rather than making a new one', async ({ page }) => {
    const server = await signedIn(page, { programs: [program('prog1111', EXAMPLE, { version: 3 })] });
    await expect.poll(() => page.evaluate(() => library.current)).toBe('prog1111');
    await page.click('[data-delprog="prog1111"]');
    await page.click('.modal .btn-danger');
    await expect(page.locator('#emptyState h2')).toHaveText('No program yet');
    await page.waitForTimeout(400);
    expect(server.called('POST /programs')).toEqual([]);
    expect(await page.evaluate(() => library.current)).toBeNull();
  });

  test('signed out, deleting the one program leaves none too', async ({ page }) => {
    errors = await openApp(page);
    const id = await page.evaluate(() => library.current);
    await page.click(`[data-delprog="${id}"]`);
    await page.click('.modal .btn-danger');
    await expect(page.locator('#emptyState h2')).toHaveText('No program yet');
    await page.reload();
    await expect(page.locator('#emptyState h2')).toHaveText('No program yet');
  });
});

test.describe('with an Individual plan: your own units', () => {
  const OWN = { units: [{ id: 'mycubs', name: 'Cubs', section: 'cubs' }], region: 'SA' };

  test('your units have term tabs, and New opens your units', async ({ page }) => {
    const server = await signedIn(page, { limit: null, programs: [program('prog1111', { ...EXAMPLE, unit: 'mycubs' }, { version: 3, unit: 'mycubs' })] },
      (s) => { s.mode = 'units'; s.own = OWN; });
    const own = page.locator('.dir-group:has(.dir-own)');
    await expect(own.locator('.dir-head')).toContainText('Your units');
    await expect(own.locator('.dir-unit-head')).toHaveText(['Cubs']);
    await expect(own.locator('.term-tab.has')).toHaveText(['T1 27']);
    // Starting a term of your own
    await own.locator('.term-tab:has-text("T2 27")').click();
    await expect.poll(() => [...server.programs.values()].filter((p) => p.unit === 'mycubs').length).toBe(2);
    const made = [...server.programs.values()].find((p) => p.unit === 'mycubs' && p.term === 2);
    expect(made).toMatchObject({ owner: 'me', year: 2027 });
    expect(made.data.branding.sectionName).toBe('Cubs');
    // New is your units: add one
    await expect(page.locator('#btnDirNew')).toContainText('Units');
    await page.click('#btnDirNew');
    await expect(page.locator('.modal h2')).toHaveText('Your units');
    await page.click('#btnAddUnit');
    await page.fill('.modal .unit-line:nth-child(2) [data-name]', 'Kingfisher Troop');
    await page.selectOption('.modal .unit-line:nth-child(2) [data-section]', 'scouts');
    await page.click('.modal-actions .btn-primary');
    await expect.poll(() => server.own.units.map((u) => u.name)).toEqual(['Cubs', 'Kingfisher Troop']);
    await expect(own.locator('.dir-unit-head')).toHaveText(['Cubs', 'Kingfisher Troop']);
  });

  test('a past term of your own is kept as it was', async ({ page }) => {
    await signedIn(page, { limit: null, programs: [program('old11111', { ...EXAMPLE, unit: 'mycubs', term: { ...EXAMPLE.term, year: 2025, term: 4, start: '2025-10-13', end: '2025-12-12' } }, { version: 2, unit: 'mycubs', year: 2025, term: 4 })] },
      (s) => { s.mode = 'units'; s.own = OWN; });
    await expect.poll(() => page.evaluate(() => library.current)).toBe('old11111');
    await expect(page.locator('#readOnlyNote')).toContainText('Term 4 2025 has ended');
  });
});

test.describe("with only a group's Group plan", () => {
  test('your own programs are read only, New is gone, and the group has your programs', async ({ page }) => {
    const server = await signedIn(page, { groups: [GROUP], programs: [program('prog1111', EXAMPLE, { version: 3 })] }, (s) => {
      s.mode = 'group';
      s.libraries.set('g1', { units: [{ id: 'banksia', name: 'Banksia Cubs', section: 'cubs' }], styling: null, region: 'SA', myUnits: ['banksia'] });
    });
    await expect.poll(() => page.evaluate(() => library.current)).toBe('prog1111');
    await expect(page.locator('#readOnlyNote')).toContainText("Your group's Group plan covers your programs in its library");
    await expect(page.locator('.dir-head').first()).toContainText('read only');
    await expect(page.locator('#btnDirNew')).toBeHidden();
    const puts = server.called('PUT').length;
    await page.evaluate(() => { state.rows[0].activity = 'Changed'; save(); });
    expect(server.called('PUT')).toHaveLength(puts);
    // Their programs are the group's: its tabs
    await expect(page.locator('.dir-unit[data-unit="banksia"] .term-tab')).toHaveCount(5);
  });

  test("starting a term in the group's library: the group's from the start, never shown as kept as it was", async ({ page }) => {
    const server = await signedIn(page, { groups: [GROUP], programs: [] }, (s) => {
      s.mode = 'group';
      s.libraries.set('g1', { units: [{ id: 'banksia', name: 'Banksia Cubs', section: 'cubs' }], styling: null, region: 'SA', myUnits: ['banksia'] });
    });
    await page.locator('.dir-unit[data-unit="banksia"] .term-tab:has-text("T1 27")').click();
    await expect.poll(() => page.evaluate(() => libItem(library.current)?.owner)).toBe('group:g1');
    await expect(page.locator('#readOnlyNote')).toBeHidden();
    await expect.poll(() => [...server.programs.values()].map((p) => [p.owner, p.unit])).toEqual([['group:g1', 'banksia']]);
    await expect(page.locator('#readOnlyNote')).toBeHidden();
  });
});
