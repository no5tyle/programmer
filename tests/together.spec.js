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

test.describe('live', () => {
  test("another leader's save shows up here, without a word from anyone", async ({ page }) => {
    const { server } = await open(page);
    server.otherSaves('prog1111', (d) => { d.rows[1].activity = 'Baloo was here'; });
    await expect.poll(() => activities(page).then((a) => a[1])).toBe('Baloo was here');
    await expect(page.locator('.toast').last()).toContainText('Updated with the changes from Baloo');
    expect(server.called('PUT')).toEqual([]);   // nothing of mine to send
    await expect(saveState(page)).toHaveText('Saved to your account');
  });

  test('with a change of mine on the way, both are kept, and Undo undoes only mine', async ({ page }) => {
    const { server, p } = await open(page);
    server.offline = true;
    await page.evaluate(() => pushHistory());   // as a change made by hand is
    await edit(page, 'Mine');
    server.offline = false;
    server.otherSaves('prog1111', (d) => { d.rows[1].activity = 'Theirs'; });
    await expect.poll(() => [p.data.rows[0].activity, p.data.rows[1].activity]).toEqual(['Mine', 'Theirs']);
    await page.evaluate(() => undo());
    expect((await activities(page)).slice(0, 2)).toEqual([EXAMPLE.rows[0].activity, 'Theirs']);
  });

  test('while typing, their change waits until the typing stops', async ({ page }) => {
    const { server } = await open(page);
    const row = await page.evaluate(() => state.rows.find((r) => !r.noMeeting && document.querySelector(`#sheet tr[data-id="${r.id}"] td.c-description .ed`)).id);
    await page.click(`#sheet tr[data-id="${row}"] td.c-description .ed`);
    server.otherSaves('prog1111', (d) => { d.rows.at(-1).activity = 'Waited'; });
    await page.waitForTimeout(800);
    expect((await activities(page)).at(-1)).not.toBe('Waited');
    await page.evaluate(() => document.activeElement.blur());
    await expect.poll(() => activities(page).then((a) => a.at(-1))).toBe('Waited');
  });

  test("who else is here, and the cell they're in; and this tab says where it is", async ({ page }) => {
    const { server } = await open(page);
    const row = await page.evaluate(() => state.rows.find((r) => document.querySelector(`#sheet tr[data-id="${r.id}"] td.c-activity .ed`)).id);
    server.otherHere('prog1111', { id: 'u2', name: 'Baloo', tab: 'baloosTab1' }, `${row}:activity`);
    await expect(page.locator('#livePeople .live-avatar')).toHaveText(['B']);
    await expect(page.locator('#livePeople .live-avatar')).toHaveAttribute('title', 'Baloo: has this program open');
    const cell = page.locator(`#sheet tr[data-id="${row}"] td.c-activity`);
    await expect(cell).toHaveClass(/live-cell/);
    await expect(cell).toHaveAttribute('data-who', 'Baloo');
    // Into the same cell: told, once
    await cell.locator('.ed').click();
    await expect(page.locator('.toast').last()).toContainText('Baloo has this cell open too');
    await expect.poll(() => server.called('POST /programs/prog1111/here').length).toBeGreaterThan(1);
    // Baloo closes it
    server.otherLeaves('prog1111');
    await expect(page.locator('#livePeople')).toBeHidden();
    await expect(cell).not.toHaveClass(/live-cell/);
  });
});
