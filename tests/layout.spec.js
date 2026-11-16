// The builder's layout: the programs directory on the left, and the settings in a floating pane on the right.
const { test, expect } = require('@playwright/test');
const { openApp } = require('./helpers');
const { program, mockAccount, openAccountApp, SIGN_IN_LINK } = require('./account-helpers');

const EXAMPLE = require('../examples/example-program.json');
const scale = (page) => page.evaluate(() => +/scale\(([\d.]+)\)/.exec($('#paper').style.transform)[1]);

/** Adds programs to this browser's library: [section, year, term, name]. */
const addPrograms = (page, list) => page.evaluate((list) => {
  for (const [section, year, term, name] of list) {
    const c = copyOf(state);
    c.branding.section = section;
    c.branding.sectionName = SECTIONS[section]?.name || section;
    c.branding.titleTemplate = name;
    Object.assign(c.term, { year, term });
    addProgram(c);
  }
}, list);

test.describe('the settings pane', () => {
  let errors;
  test.beforeEach(async ({ page }) => { errors = await openApp(page); });
  test.afterEach(() => { expect(errors, 'browser errors').toEqual([]); });

  test('is open to start with, and never covers the program', async ({ page }) => {
    await expect(page.locator('#sidebar')).toBeVisible();
    await expect(page.locator('#btnSettings')).toHaveAttribute('aria-pressed', 'true');
    const pane = await page.locator('#sidebar').boundingBox();
    const paper = await page.locator('#paper').boundingBox();
    expect(paper.x + paper.width).toBeLessThanOrEqual(pane.x);
  });

  test('Settings hides and shows it, the program grows to fill the room, and it stays as it was left', async ({ page }) => {
    const open = await scale(page);
    await page.click('#btnSettings');
    await expect(page.locator('#sidebar')).toBeHidden();
    await expect(page.locator('#btnSettings')).toHaveAttribute('aria-pressed', 'false');
    expect(await scale(page)).toBeGreaterThan(open);

    await page.reload();
    await page.waitForFunction(() => typeof state === 'object');
    await expect(page.locator('#sidebar')).toBeHidden();

    await page.click('#btnSettings');
    await expect(page.locator('#sidebar')).toBeVisible();
    await page.click('#btnSettingsClose');
    await expect(page.locator('#sidebar')).toBeHidden();
    await expect(page.locator('#btnSettings')).toBeFocused();
  });

  test('the tour opens it to show the settings', async ({ page }) => {
    await page.click('#btnSettings');
    await page.evaluate(() => startTour());
    await expect(page.locator('.tour-tip h3')).toHaveText('Settings');
    await expect(page.locator('#sidebar')).toBeVisible();
  });

  test('neither the pane nor the directory prints', async ({ page }) => {
    await page.emulateMedia({ media: 'print' });
    await expect(page.locator('#sidebar')).toBeHidden();
    await expect(page.locator('#directory')).toBeHidden();
    await expect(page.locator('#sheet')).toBeVisible();
  });
});

test.describe('the programs directory', () => {
  let errors;
  test.afterEach(() => { expect(errors, 'browser errors').toEqual([]); });

  test('groups programs by section, in Scouts order, each newest term first', async ({ page }) => {
    errors = await openApp(page);
    await addPrograms(page, [
      ['scouts', 2027, 1, 'Scouts T1 2027'], ['cubs', 2027, 2, 'Cubs T2 2027'], ['joeys', 2026, 4, 'Joeys T4 2026'],
      ['cubs', 2027, 1, 'Cubs T1 2027'], ['cubs', 2025, 4, 'Cubs T4 2025'],
    ]);
    await expect(page.locator('#dirWhere')).toHaveText('In this browser');
    await expect(page.locator('.dir-head')).toHaveText([/^Joeys\s*1$/, /^Cubs\s*4$/, /^Scouts\s*1$/]);
    const cubs = page.locator('.dir-group').nth(1).locator('.dir-item b');
    // The starting program is Cubs, Term 4 2026
    await expect(cubs).toHaveText(['Cubs T2 2027', 'Cubs T1 2027', /Term 4 2026/, 'Cubs T4 2025']);
    await expect(page.locator('.dir-group').nth(1).locator('.dir-item span').first()).toHaveText('Term 2 2027');
  });

  test('opens a program, and marks the one that is open', async ({ page }) => {
    errors = await openApp(page);
    const first = await page.evaluate(() => library.current);
    await addPrograms(page, [['scouts', 2027, 1, 'Scouts T1 2027']]);
    await expect(page.locator('.dir-item[aria-current="true"] b')).toHaveText('Scouts T1 2027');
    await page.click(`.dir-item[data-open="${first}"]`);
    await expect.poll(() => page.evaluate(() => library.current)).toBe(first);
    await expect(page.locator(`.dir-item[data-open="${first}"]`)).toHaveAttribute('aria-current', 'true');
    await expect(page.locator('#sheet')).toContainText('Cubs');
  });

  test('New starts a program, and it appears in its place', async ({ page }) => {
    errors = await openApp(page);
    await page.click('#btnDirNew');
    await page.click('.modal [data-i="2"]');   // next term
    await expect(page.locator('.dir-item')).toHaveCount(2);
    await expect(page.locator('.dir-item b').first()).toContainText('Term 1 2027');
  });

  test("signed in, lists the account's programs, including ones not opened on this device yet", async ({ page }) => {
    const scouts = { ...EXAMPLE, branding: { ...EXAMPLE.branding, section: 'scouts', sectionName: 'Scouts' }, term: { ...EXAMPLE.term, year: 2027, term: 2 } };
    const joeys = { ...EXAMPLE, branding: { ...EXAMPLE.branding, section: 'joeys', sectionName: 'Joeys' }, term: { ...EXAMPLE.term, year: 2027, term: 1 } };
    const server = await mockAccount(page, {
      signedIn: true,
      programs: [program('prog1111', EXAMPLE, { name: 'Cubs one' }), program('prog2222', scouts, { name: 'Scouts one', updatedAt: '2026-01-01T00:00:00.000Z' }),
        program('prog3333', joeys, { name: 'Joeys one', updatedAt: '2026-01-02T00:00:00.000Z' })],
    });
    errors = await openAccountApp(page, SIGN_IN_LINK);
    await expect(page.locator('#dirWhere')).toHaveText('In your account');
    await expect(page.locator('.dir-head')).toHaveText([/^Joeys/, /^Cubs/, /^Scouts/]);
    await expect(page.locator('.dir-item[data-open="prog2222"] span')).toHaveText(/^Term 2 2027/);
    expect(await page.evaluate(() => localStorage.getItem('scoutProgramBuilder.program.prog2222'))).toBeNull();
    await page.click('.dir-item[data-open="prog2222"]');
    await expect.poll(() => page.evaluate(() => [library.current, state.branding.section])).toEqual(['prog2222', 'scouts']);
    expect(server.called('GET /programs/prog2222').length).toBeGreaterThan(0);
  });

  test('signed out, offers to sign in', async ({ page }) => {
    await mockAccount(page);
    errors = await openAccountApp(page);
    await expect(page.locator('#dirWhere')).toHaveText('On this device');
    await page.click('[data-dir-signin]');
    await expect(page.locator('.modal h2')).toHaveText('Sign in');
  });
});
