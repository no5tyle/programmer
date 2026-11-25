// Working on a program together: changes made in two places are put together, and another leader's saves,
// and where they are, show up live (js/merge.js, js/live.js, and takeTheirs in js/account.js).
const { test, expect } = require('@playwright/test');
const { program, mockAccount, openAccountApp, edit, SIGN_IN_LINK } = require('./account-helpers');

const EXAMPLE = require('../examples/example-program.json');
const saveState = (page) => page.locator('#saveState span');

let errors;
test.afterEach(() => { expect(errors, 'browser errors').toEqual([]); });

async function open(page) {
  const server = await mockAccount(page, { signedIn: true, programs: [program('prog1111', EXAMPLE, { version: 3 })] });
  errors = await openAccountApp(page, SIGN_IN_LINK);
  await expect.poll(() => page.evaluate(() => library.current)).toBe('prog1111');
  await expect(saveState(page)).toHaveText('Saved to your account');
  return { server, p: server.programs.get('prog1111') };
}
const activities = (page) => page.evaluate(() => state.rows.map((r) => r.activity));

test('typing in a cell carries on through the saves it sends: nothing redraws the sheet under it', async ({ page }) => {
  await open(page);
  const row = await page.evaluate(() => state.rows.find((r) => document.querySelector(`#sheet tr[data-id="${r.id}"] td.c-description .ed`)).id);
  const cell = page.locator(`#sheet tr[data-id="${row}"] td.c-description .ed`);
  await cell.click();
  // Long enough for several saves to go out and come back
  for (let i = 0; i < 12; i++) {
    await page.keyboard.type('ab', { delay: 40 });
    await page.waitForTimeout(400);
    expect(await page.evaluate(() => document.activeElement?.classList.contains('ed'))).toBe(true);
  }
  await expect(cell).toContainText('ab'.repeat(12));
});

test("coming back to the window while typing doesn't take the cell away: the other device's change waits, then comes in", async ({ page }) => {
  const { server } = await open(page);
  const row = await page.evaluate(() => state.rows.find((r) => document.querySelector(`#sheet tr[data-id="${r.id}"] td.c-activity .ed`)).id);
  const cell = page.locator(`#sheet tr[data-id="${row}"] td.c-activity .ed`);
  await cell.click();
  await page.keyboard.press('ControlOrMeta+a');
  for (let i = 0; i < 6; i++) {
    server.otherSaves('prog1111', (d) => { d.rows.at(-1).activity = `Phone ${i}`; }, { id: 'me', name: 'Akela', tab: 'phoneTab' });
    await page.evaluate(() => catchUp());   // as on coming back to the window
    await page.keyboard.type('ab', { delay: 40 });
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => document.activeElement?.classList.contains('ed')), `still typing, round ${i}`).toBe(true);
  }
  await expect(cell).toHaveText('ab'.repeat(6));
  await page.keyboard.press('Escape');
  await expect.poll(() => activities(page).then((a) => a.at(-1))).toBe('Phone 5');
  await expect.poll(() => server.programs.get('prog1111').data.rows.find((r) => r.id === row).activity).toBe('ab'.repeat(6));
});

test.describe('changes in two places', () => {
  test('different rows: both kept, with no question', async ({ page }) => {
    const { p } = await open(page);
    // Saved elsewhere, unseen here: the second row changed there
    const theirs = JSON.parse(JSON.stringify(p.data));
    theirs.rows[1].activity = 'Theirs';
    Object.assign(p, { version: 4, data: theirs, updatedBy: { id: 'u2', name: 'Baloo' } });
    await edit(page, 'Mine');   // the first row, here
    await expect.poll(() => p.version).toBe(5);
    expect([p.data.rows[0].activity, p.data.rows[1].activity]).toEqual(['Mine', 'Theirs']);
    await expect(page.locator('.modal-backdrop')).toBeHidden();
    expect((await activities(page)).slice(0, 2)).toEqual(['Mine', 'Theirs']);
    await expect(saveState(page)).toHaveText('Saved to your account');
  });

  test('the same cell: mine is kept, and it says so', async ({ page }) => {
    const { p } = await open(page);
    const theirs = JSON.parse(JSON.stringify(p.data));
    theirs.rows[0].activity = 'Theirs';
    Object.assign(p, { version: 4, data: theirs, updatedBy: { id: 'u2', name: 'Baloo' } });
    await edit(page, 'Mine');
    await expect.poll(() => [p.version, p.data.rows[0].activity]).toEqual([5, 'Mine']);
    await expect(page.locator('.toast').last()).toContainText('You and Baloo both changed the activity on');
    await expect(page.locator('.modal-backdrop')).toBeHidden();
  });

  test('a row added in each place: both kept; one deleted there and left alone here: gone', async ({ page }) => {
    const { p } = await open(page);
    const theirs = JSON.parse(JSON.stringify(p.data));
    const gone = theirs.rows.splice(2, 1)[0].id;
    theirs.rows.push({ ...theirs.rows[0], id: 'theirrow', activity: 'Their new night' });
    Object.assign(p, { version: 4, data: theirs });
    await page.evaluate(() => { pushHistory(); state.rows.push({ ...state.rows[0], id: 'minerow', activity: 'My new night' }); renderDoc(); saveSoon(); });
    await expect.poll(() => p.data.rows.map((r) => r.id)).toContain('minerow');
    const ids = p.data.rows.map((r) => r.id);
    expect(ids).toContain('theirrow');
    expect(ids).toContain('minerow');
    expect(ids).not.toContain(gone);
  });
});

// Live: a group library's program (a Group plan feature)
const GROUP = { id: 'g1', name: '1st Example', role: 'leader', gearRole: 'leader', plan: true };
async function openLibrary(page) {
  const data = { ...EXAMPLE, unit: 'banksia' };
  const server = await mockAccount(page, { signedIn: true, groups: [GROUP], programs: [program('prog1111', data, { version: 3, owner: 'group:g1', unit: 'banksia' })] });
  server.libraries.set('g1', { units: [{ id: 'banksia', name: 'Banksia Cubs', section: 'cubs' }], styling: null, region: 'SA', myUnits: 'all' });
  errors = await openAccountApp(page, SIGN_IN_LINK);
  await expect.poll(() => page.evaluate(() => !!libItem('prog1111'))).toBe(true);
  await page.evaluate(() => openProgram('prog1111'));
  await expect.poll(() => page.evaluate(() => library.current)).toBe('prog1111');
  await expect(saveState(page)).toHaveText('Saved to your account');
  await expect.poll(() => server.called('POST /programs/prog1111/live').length).toBeGreaterThan(0);
  return { server, p: server.programs.get('prog1111') };
}
/** The next look, without waiting for it. */
const lookNow = (page) => page.evaluate(() => liveLook());

test.describe('live', () => {
  test("another leader's save shows up here at the next look", async ({ page }) => {
    const { server } = await openLibrary(page);
    server.otherSaves('prog1111', (d) => { d.rows[1].activity = 'Baloo was here'; });
    await lookNow(page);
    await expect.poll(() => activities(page).then((a) => a[1])).toBe('Baloo was here');
    await expect(page.locator('.toast').last()).toContainText('Updated with the changes from Baloo');
    await page.waitForTimeout(600);
    expect(server.programs.get('prog1111').data.rows[1].activity).toBe('Baloo was here');   // still theirs in the account
  });

  test("says whose changes came in once, not at every save of theirs while they type", async ({ page }) => {
    const { server } = await openLibrary(page);
    const told = () => page.evaluate(() => [...document.querySelectorAll('.toast')].filter((t) => t.textContent.includes('Updated with the changes from Baloo')).length);
    for (const name of ['Baloo was here', 'Baloo was here again', 'Baloo, a third time']) {
      server.otherSaves('prog1111', (d) => { d.rows[1].activity = name; });
      await lookNow(page);
      await expect.poll(() => activities(page).then((a) => a[1])).toBe(name);
    }
    expect(await page.evaluate(() => toldOf.who.size)).toBe(1);
    expect(await told()).toBeLessThanOrEqual(1);
  });

  test("typing in a cell carries on while another leader's saves keep arriving", async ({ page }) => {
    const { server } = await openLibrary(page);
    server.otherHere('prog1111', { id: 'u2', name: 'Baloo', tab: 'baloosTab1' }, null);
    const row = await page.evaluate(() => state.rows.find((r) => document.querySelector(`#sheet tr[data-id="${r.id}"] td.c-description .ed`)).id);
    const cell = page.locator(`#sheet tr[data-id="${row}"] td.c-description .ed`);
    await cell.click();
    for (let i = 0; i < 10; i++) {
      server.otherSaves('prog1111', (d) => { d.rows.at(-1).activity = `Baloo ${i}`; });
      await lookNow(page);
      await page.keyboard.type('ab', { delay: 40 });
      await page.waitForTimeout(400);
      expect(await page.evaluate(() => document.activeElement?.classList.contains('ed')), `still typing, round ${i}`).toBe(true);
    }
    await expect(cell).toContainText('ab'.repeat(10));
    // Once the typing stops, theirs comes in, and mine is saved
    await page.keyboard.press('Escape');
    await expect.poll(() => activities(page).then((a) => a.at(-1))).toBe('Baloo 9');
    await expect.poll(() => server.programs.get('prog1111').data.rows.find((r) => r.id === row).description).toContain('ab'.repeat(10));
  });

  test('with a change of mine on the way, both are kept, and Undo undoes only mine', async ({ page }) => {
    const { server, p } = await openLibrary(page);
    server.offline = true;
    await page.evaluate(() => pushHistory());   // as a change made by hand is
    await edit(page, 'Mine');
    server.offline = false;
    server.otherSaves('prog1111', (d) => { d.rows[1].activity = 'Theirs'; });
    await lookNow(page);
    await expect.poll(() => [p.data.rows[0].activity, p.data.rows[1].activity]).toEqual(['Mine', 'Theirs']);
    await page.evaluate(() => undo());
    expect((await activities(page)).slice(0, 2)).toEqual([EXAMPLE.rows[0].activity, 'Theirs']);
  });

  test('while typing, their change waits until the typing stops', async ({ page }) => {
    const { server } = await openLibrary(page);
    const row = await page.evaluate(() => state.rows.find((r) => !r.noMeeting && document.querySelector(`#sheet tr[data-id="${r.id}"] td.c-description .ed`)).id);
    await page.click(`#sheet tr[data-id="${row}"] td.c-description .ed`);
    server.otherSaves('prog1111', (d) => { d.rows.at(-1).activity = 'Waited'; });
    await lookNow(page);
    await page.waitForTimeout(500);
    expect((await activities(page)).at(-1)).not.toBe('Waited');
    await page.evaluate(() => document.activeElement.blur());
    await expect.poll(() => activities(page).then((a) => a.at(-1))).toBe('Waited');
  });

  test("who else is here, and the cell they're in; and a move to a cell is said straight away", async ({ page }) => {
    const { server } = await openLibrary(page);
    const row = await page.evaluate(() => state.rows.find((r) => document.querySelector(`#sheet tr[data-id="${r.id}"] td.c-activity .ed`)).id);
    server.otherHere('prog1111', { id: 'u2', name: 'Baloo', tab: 'baloosTab1' }, `${row}:activity`);
    await lookNow(page);
    await expect(page.locator('#livePeople .live-avatar')).toHaveText(['B']);
    await expect(page.locator('#livePeople .live-avatar')).toHaveAttribute('title', 'Baloo: has this program open');
    const cell = page.locator(`#sheet tr[data-id="${row}"] td.c-activity`);
    await expect(cell).toHaveClass(/live-cell/);
    await expect(cell).toHaveAttribute('data-who', 'Baloo');
    // Into the same cell: told, once; and said at once
    const looks = server.called('POST /programs/prog1111/live').length;
    await cell.locator('.ed').click();
    await expect(page.locator('.toast').last()).toContainText('Baloo has this cell open too');
    await expect.poll(() => server.called('POST /programs/prog1111/live').length).toBeGreaterThan(looks);
    // Baloo closes it
    server.otherLeaves('prog1111');
    await lookNow(page);
    await expect(page.locator('#livePeople')).toBeHidden();
    await expect(cell).not.toHaveClass(/live-cell/);
  });

  test('looks every 3 seconds with someone else here, every 15 alone, and stops after 10 idle minutes', async ({ page }) => {
    await page.clock.install();
    const { server } = await openLibrary(page);
    const looks = () => server.called('POST /programs/prog1111/live').length;
    // Time moves on a second at a time, so each look's answer arrives before the next is due
    const pass = async (seconds) => { for (let s = 0; s < seconds; s++) { await page.clock.runFor(1000); await page.waitForTimeout(5); } };
    await pass(2);
    let n = looks();
    await pass(8);
    expect(looks()).toBe(n);   // alone: not yet
    await pass(9);
    expect(looks()).toBe(n + 1);
    server.otherHere('prog1111');
    await pass(15);   // the next look finds Baloo; from then on, every 3 seconds
    n = looks();
    await pass(31);
    expect(looks()).toBeGreaterThanOrEqual(n + 9);
    expect(looks()).toBeLessThanOrEqual(n + 11);
    // Ten minutes with no typing or clicking: it stops, saying it's closed
    await pass(10 * 60);
    expect(server.calls.some((c) => c.startsWith('DELETE /programs/prog1111/live'))).toBe(true);
    n = looks();
    await pass(120);
    expect(looks()).toBe(n);
    // Used again: straight back
    await page.mouse.click(5, 300);
    await expect.poll(looks).toBe(n + 1);
  });

  test("a program of one's own is watched too: their other device's change shows here", async ({ page }) => {
    const { server, p } = await open(page);
    await expect.poll(() => server.called('POST /programs/prog1111/live').length).toBeGreaterThan(0);
    // Their phone has it open, and saves a change
    server.otherHere('prog1111', { id: 'u1', name: 'Akela', tab: 'akelasPhone1' });
    server.otherSaves('prog1111', (d) => { d.rows[1].activity = 'From my phone'; });
    await expect.poll(() => activities(page).then((a) => a[1]), { timeout: 20_000 }).toBe('From my phone');
    expect(p.version).toBeGreaterThan(3);
  });
});
