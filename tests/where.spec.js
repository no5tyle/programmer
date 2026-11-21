// Where: one of the group's spaces in Quarters Master (booked for the night on its Facilities calendar), a place used
// before, or anywhere. A night at a space says how it stands: pencilled in, booked, awaiting approval or declined.
const { test, expect } = require('@playwright/test');
const { program, mockAccount, openAccountApp, SIGN_IN_LINK } = require('./account-helpers');
const { openApp } = require('./helpers');

const EXAMPLE = require('../examples/example-program.json');   // Cubs, Term 1 2027 (SA)
const GROUP = { id: 'g1', name: '1st Example', role: 'owner', gearRole: 'quartermaster', plan: true };
const SPACES = [{ id: 'den', name: 'Den', shared: true }, { id: 'hall', name: 'Main hall', shared: false }];

let errors;
test.afterEach(() => { expect(errors, 'browser errors').toEqual([]); });

async function openLibrary(page) {
  await page.clock.setFixedTime(new Date('2026-11-18T10:00:00+10:30'));
  const data = { ...EXAMPLE, unit: 'banksia' };
  const server = await mockAccount(page, { signedIn: true, limit: null, groups: [GROUP], programs: [program('lib11111', data, { version: 3, owner: 'group:g1', unit: 'banksia' })] });
  server.libraries.set('g1', { units: [{ id: 'banksia', name: 'Banksia Cubs', section: 'cubs' }], styling: null, region: 'SA', myUnits: 'all', spaces: SPACES });
  errors = await openAccountApp(page, SIGN_IN_LINK);
  await expect.poll(() => page.evaluate(() => !!libItem('lib11111'))).toBe(true);
  await page.evaluate(() => openProgram('lib11111'));
  await expect.poll(() => page.evaluate(() => library.current)).toBe('lib11111');
  // The Where column is shown
  await page.evaluate(() => { state.columns.find((c) => c.key === 'where').visible = true; save(); renderAll(); });
  const row = await page.evaluate(() => state.rows.find((r) => !r.noMeeting && !r.autoHoliday).id);
  return { server, row, cell: page.locator(`#sheet tr[data-id="${row}"] td.c-where`) };
}

test("a group library program's Where offers the group's spaces, and the night is pencilled in, then booked", async ({ page }) => {
  const { server, row, cell } = await openLibrary(page);
  await cell.click();
  await expect(page.locator('.popover .pop-title')).toHaveText('Where');
  await expect(page.locator('.popover .menu-label').first()).toHaveText("1st Example's spaces");
  await expect(page.locator('.popover [data-space]')).toHaveText(['Den', 'Main hall']);
  await page.click('.popover [data-space="hall"]');
  // Saved with the space; the cell says it's pencilled in
  await expect.poll(() => server.programs.get('lib11111').data.rows.find((r) => r.id === row)).toMatchObject({ space: 'hall', where: 'Main hall' });
  await expect(cell.locator('.pick')).toHaveText('Main hall');
  // No label in the cell: its border's tinted, and hovering says why
  await expect(cell).toHaveClass(/night-tentative/);
  await expect(cell).toHaveAttribute('title', /^Pencilled in\. /);
  await expect(cell.locator('.night')).toHaveCount(0);
  // Published: booked
  await page.evaluate(() => publishCurrent());
  await expect(cell).toHaveClass(/night-confirmed/);
  await expect(cell).toHaveAttribute('title', /^Booked\. /);
  // Not on paper
  await page.emulateMedia({ media: 'print' });
  expect(await cell.evaluate((td) => getComputedStyle(td).outlineStyle)).toBe('none');
  await expect(cell.locator('.pick')).toHaveText('Main hall');
});

test("someone else has the space: the cell says so, and publishing asks a quartermaster", async ({ page }) => {
  const { server, row, cell } = await openLibrary(page);
  server.clashes = { [row]: { title: 'Yoga class', startAt: '2027-02-01T19:00', endAt: '2027-02-01T21:00' } };
  await cell.click();
  await page.click('.popover [data-space="hall"]');
  await expect(cell).toHaveClass(/night-tentative night-warn/);
  await expect(cell).toHaveAttribute('title', /Yoga class has it 19:00–21:00/);
  await page.evaluate(() => publishCurrent());
  await expect(cell).toHaveAttribute('title', /^Awaiting approval\. /);
  // Its state is fetched again when the program's opened
  await page.reload();
  await page.waitForFunction(() => typeof state === 'object' && library.current === 'lib11111');
  await expect(page.locator(`#sheet tr[data-id="${row}"] td.c-where`)).toHaveClass(/night-requested/);
});

test('somewhere else: a place by name, not a space; and it is offered again for other nights', async ({ page }) => {
  const { server, row, cell } = await openLibrary(page);
  await cell.click();
  await page.fill('.popover #pPick', 'The oval');
  await page.press('.popover #pPick', 'Enter');
  await expect.poll(() => server.programs.get('lib11111').data.rows.find((r) => r.id === row)).toMatchObject({ where: 'The oval', space: '' });
  await expect(cell).not.toHaveClass(/night-/);
  const other = await page.evaluate((id) => state.rows.find((r) => !r.noMeeting && !r.autoHoliday && r.id !== id).id, row);
  await page.locator(`#sheet tr[data-id="${other}"] td.c-where`).click();
  await expect(page.locator('.popover .choice[data-v="The oval"]')).toBeVisible();
});

test("a program that isn't in a group's library: places only, no spaces", async ({ page }) => {
  errors = await openApp(page);
  await page.evaluate(() => { state.columns.find((c) => c.key === 'where').visible = true; save(); renderAll(); });
  const row = await page.evaluate(() => state.rows.find((r) => !r.noMeeting && !r.autoHoliday).id);
  await page.locator(`#sheet tr[data-id="${row}"] td.c-where`).click();
  await expect(page.locator('.popover [data-space]')).toHaveCount(0);
  await page.fill('.popover #pPick', 'Scout hall');
  await page.click('.popover #pPickSet');
  await expect(page.locator(`#sheet tr[data-id="${row}"] td.c-where .pick`)).toHaveText('Scout hall');
});
