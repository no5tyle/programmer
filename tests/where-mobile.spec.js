// Where on a phone: the group's spaces and places as choices, or anywhere typed.
const { test, expect, devices } = require('@playwright/test');
const { program, mockAccount, openAccountApp, SIGN_IN_LINK } = require('./account-helpers');

const { defaultBrowserType, ...iPhone } = devices['iPhone 13'];
test.use({ ...iPhone, browserName: 'chromium' });

const EXAMPLE = require('../examples/example-program.json');
const GROUP = { id: 'g1', name: '1st Example', role: 'owner', gearRole: 'quartermaster', plan: true };

test("a phone's editor offers the group's spaces for Where, and says how the night stands", async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-18T10:00:00+10:30'));
  const data = { ...EXAMPLE, unit: 'banksia', columns: EXAMPLE.columns.map((c) => (c.key === 'where' ? { ...c, visible: true } : c)) };
  const server = await mockAccount(page, { signedIn: true, limit: null, groups: [GROUP], programs: [program('lib11111', data, { version: 3, owner: 'group:g1', unit: 'banksia' })] });
  server.libraries.set('g1', { units: [{ id: 'banksia', name: 'Banksia Cubs', section: 'cubs' }], styling: null, region: 'SA', myUnits: 'all', spaces: [{ id: 'hall', name: 'Main hall', shared: false }] });
  const errors = await openAccountApp(page, SIGN_IN_LINK);
  await expect.poll(() => page.evaluate(() => !!libItem('lib11111'))).toBe(true);
  await page.evaluate(() => openProgram('lib11111'));
  await expect.poll(() => page.evaluate(() => library.current)).toBe('lib11111');
  const first = EXAMPLE.rows.find((r) => !r.noMeeting && !r.autoHoliday);
  await page.click(`.m-row:has-text("${first.activity}")`);
  const chips = page.locator('[data-chips="where"] .m-chip');
  await expect(chips.first()).toHaveText('Main hall');
  await chips.first().click();
  await expect.poll(() => server.programs.get('lib11111').data.rows.find((r) => r.activity === first.activity)).toMatchObject({ space: 'hall', where: 'Main hall' });
  await expect(page.locator('[data-style-field="where"] .night')).toHaveText('Pencilled in');
  // Typed: a place, not the space
  await page.fill('[data-f="where"]', 'The oval');
  await expect.poll(() => server.programs.get('lib11111').data.rows.find((r) => r.activity === first.activity)).toMatchObject({ space: '', where: 'The oval' });
  expect(errors).toEqual([]);
});
