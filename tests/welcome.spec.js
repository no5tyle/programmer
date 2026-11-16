// The first-visit setup wizard and the tour after it (js/welcome.js).
const { test, expect, devices } = require('@playwright/test');

function watchErrors(page) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  return errors;
}

async function runWizard(page) {
  await expect(page.locator('.wz h2')).toHaveText('Welcome to Program Builder');
  // Each step needs its answer
  await page.click('[data-wz="next"]');
  await expect(page.locator('.wz-error')).toHaveText("Enter your group's name.");
  await page.fill('#wzGroup', '1st Example Scout Group');
  await page.keyboard.press('Enter');
  await expect(page.locator('.wz h2')).toHaveText('Which section?');
  await expect(page.locator('[data-section="cubs"] img')).toHaveAttribute('src', 'assets/section-logos/cubs-emblem.png');
  await page.click('[data-section="scouts"]');
  await page.click('[data-wz="next"]');
  await expect(page.locator('.wz h2')).toHaveText('Which term?');
  await page.selectOption('[data-wt="region"]', 'VIC');
  await page.selectOption('[data-wt="year"]', '2027');
  await page.selectOption('[data-wt="term"]', '1');
  await page.selectOption('[data-wt="meetingDay"]', '3');
  await expect(page.locator('.wz-summary')).toHaveText('28 Jan – 25 Mar 2027 · 8 Wednesday meetings');
  await expect(page.locator('.wz-dates')).toBeHidden();
  // A region without built-in dates asks for them
  await page.selectOption('[data-wt="region"]', 'custom');
  await expect(page.locator('.wz-dates')).toBeVisible();
  await page.fill('[data-wt="end"]', '2027-03-01');
  await expect(page.locator('.wz-summary')).toHaveText('28 Jan – 1 Mar 2027 · 4 Wednesday meetings');
  await page.selectOption('[data-wt="region"]', 'VIC');
  await expect(page.locator('.wz-summary')).toHaveText('28 Jan – 25 Mar 2027 · 8 Wednesday meetings');
  await page.click('[data-wz="next"]');
  await expect(page.locator('.wz h2')).toHaveText('Who are the leaders?');
  await page.click('[data-wz="next"]');
  await expect(page.locator('.wz-error')).toHaveText("Enter at least one leader's name.");
  await page.fill('[data-wl="0"][data-f="name"]', 'Akela');
  await page.fill('[data-wl="0"][data-f="phone"]', '0400 000 001');
  await page.click('#wzAddLeader');
  await page.fill('[data-wl="1"][data-f="name"]', 'Baloo');
  await page.click('[data-wz="next"]');
  await expect(page.locator('.wz-backdrop')).toHaveCount(0);
}

async function stepThroughTour(page, count) {
  for (let i = 1; i <= count; i++) {
    await expect(page.locator('.tour-count')).toHaveText(`${i} of ${count}`);
    // Each stop's highlight takes in every one of its targets that's on screen
    // (polled: the highlight slides from the last stop for a quarter of a second)
    await expect.poll(() => page.evaluate(() => {
      const spot = document.querySelector('.tour-spot').getBoundingClientRect();
      const step = tour.steps[tour.i];
      return step.target.filter((sel) => {
        const el = document.querySelector(sel); if (!visibleEl(el)) return false;
        const r = el.getBoundingClientRect();
        const inView = r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth;
        // The highlight stops 4px short of the screen's edges
        const c = { left: Math.max(4, r.left), top: Math.max(4, r.top), right: Math.min(innerWidth - 4, r.right), bottom: Math.min(innerHeight - 4, r.bottom) };
        return inView && (c.left < spot.left - 1 || c.right > spot.right + 1 || c.top < spot.top - 1 || c.bottom > spot.bottom + 1);
      });
    })).toEqual([]);
    const tip = await page.locator('.tour-tip').boundingBox();
    const vp = page.viewportSize();
    expect(tip.x).toBeGreaterThanOrEqual(0);
    expect(tip.y).toBeGreaterThanOrEqual(0);
    expect(tip.x + tip.width).toBeLessThanOrEqual(vp.width);
    expect(tip.y + tip.height).toBeLessThanOrEqual(vp.height);
    await page.click('[data-tour="next"]');
  }
  await expect(page.locator('.tour-layer')).toHaveCount(0);
  // Every button in the toolbar is in a stop
  const toolbar = await page.evaluate(() => [...document.querySelectorAll('.ws-toolbar .ws-group:first-child button')]
    .filter(visibleEl).map((b) => `#${b.id}`).filter((id) => !TOUR_DESKTOP.some((s) => s.target.includes(id))));
  expect(toolbar).toEqual([]);
}

test('first visit: setup wizard, then the tour', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/');
  await runWizard(page);
  const b = await page.evaluate(() => state.branding);
  expect(b.groupName).toBe('1st Example Scout Group');
  expect([b.section, b.sectionName]).toEqual(['scouts', 'Scouts']);
  expect(b.leaders).toEqual([{ name: 'Akela', phone: '0400 000 001' }, { name: 'Baloo', phone: '' }]);
  const t = await page.evaluate(() => [state.term, state.rows.map((r) => r.date)]);
  expect(t[0]).toMatchObject({ region: 'VIC', year: 2027, term: 1, meetingDay: 3, start: '2027-01-28', end: '2027-03-25' });
  // The term starts on Thursday 28 January: Week 1's Wednesday is a week off
  expect(t[1]).toEqual(['2027-01-27', '2027-02-03', '2027-02-10', '2027-02-17', '2027-02-24', '2027-03-03', '2027-03-10', '2027-03-17', '2027-03-24']);
  await expect(page.locator('[data-bind="term.region"]')).toHaveValue('VIC');
  await expect(page.locator('#sheet')).toContainText('Akela');
  await stepThroughTour(page, 9);

  // Not shown again, and the tour can be taken from the sidebar
  await page.reload();
  await page.waitForFunction(() => typeof state === 'object');
  await expect(page.locator('.wz-backdrop')).toHaveCount(0);
  expect(await page.evaluate(() => state.branding.groupName)).toBe('1st Example Scout Group');
  await page.click('#btnTour');
  await expect(page.locator('.tour-count')).toHaveText('1 of 9');
  await page.keyboard.press('Escape');
  await expect(page.locator('.tour-layer')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('skipping setup keeps the defaults and is remembered', async ({ page }) => {
  await page.goto('/');
  await page.click('[data-wz="skip"]');
  await expect(page.locator('.wz-backdrop')).toHaveCount(0);
  await expect(page.locator('.tour-layer')).toHaveCount(0);
  await page.reload();
  await page.waitForFunction(() => typeof state === 'object');
  await expect(page.locator('.wz-backdrop')).toHaveCount(0);
});

test('not shown to someone who already has programs saved', async ({ page }) => {
  await page.addInitScript(() => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.setItem('scoutProgramBuilder.library.v1', JSON.stringify({ current: 'abc', items: [{ id: 'abc', name: 'Old', group: '', updated: 1 }] }));
    localStorage.setItem('scoutProgramBuilder.program.abc', JSON.stringify({ branding: { groupName: 'Existing Group' } }));
  });
  await page.goto('/');
  await page.waitForFunction(() => typeof state === 'object');
  expect(await page.evaluate(() => state.branding.groupName)).toBe('Existing Group');
  await expect(page.locator('.wz-backdrop')).toHaveCount(0);
});

test.describe('phone', () => {
  const { defaultBrowserType, ...iPhone } = devices['iPhone 13'];
  test.use(iPhone);

  test('wizard and tour fit a phone', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto('/');
    await runWizard(page);
    await expect(page.locator('#mTitleSub')).toHaveText('1st Example Scout Group');
    await stepThroughTour(page, 6);
    // Again from the menu
    await page.click('#mMenu');
    await page.click('[data-m="tour"]');
    await expect(page.locator('.tour-count')).toHaveText('1 of 6');
    expect(errors).toEqual([]);
  });
});

test('the wizard says where programs are saved', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.wz')).toContainText('saved in this browser only');
});

test('the tour has you open a row menu: clicking the ⋮ opens it and moves on, and the menu is only shown', async ({ page }) => {
  await page.addInitScript(() => { if (!localStorage.getItem('scoutProgramBuilder.welcome')) localStorage.setItem('scoutProgramBuilder.welcome', 'done'); });
  await page.goto('/');
  await page.waitForFunction(() => typeof state === 'object');
  await page.click('#btnTour');
  await page.click('[data-tour="next"]');
  await page.click('[data-tour="next"]');
  // First a week's + (which otherwise shows on hover)
  await expect(page.locator('.tour-tip h3')).toHaveText('Add to a week');
  const plus = page.locator('#sheet .wk-add.tour-show');
  await expect(plus).toHaveCount(1);
  await expect(plus).toHaveCSS('opacity', '1');
  await page.click('[data-tour="next"]');
  await expect(page.locator('#sheet .wk-add.tour-show')).toHaveCount(0);
  await expect(page.locator('.tour-tip h3')).toHaveText('Row options');
  await expect(page.locator('#rowHandle')).toBeVisible();
  // The ⋮ itself can be clicked through the tour
  await page.click('#rowHandle');
  await expect(page.locator('.tour-tip h3')).toHaveText('The row menu');
  await expect(page.locator('#popover .menu')).toBeVisible();
  // ...but not the menu's items while the tour shows them
  const rows = await page.evaluate(() => state.rows.length);
  const del = await page.locator('#popover [data-act="del"]').boundingBox();
  await page.mouse.click(del.x + del.width / 2, del.y + del.height / 2);
  expect(await page.evaluate(() => state.rows.length)).toBe(rows);
  await expect(page.locator('#popover .menu')).toBeVisible();      // and it stays open
  // Nor the rest of the page
  await page.mouse.click(600, 400);
  expect(await page.evaluate(() => document.activeElement?.closest?.('.ed'))).toBeNull();
  // Back reopens the step before (menu closed, ⋮ showing); Next on it opens the menu too
  await page.click('[data-tour="back"]');
  await expect(page.locator('#popover')).toBeHidden();
  await expect(page.locator('#rowHandle')).toBeVisible();
  await page.click('[data-tour="next"]');
  await expect(page.locator('#popover .menu')).toBeVisible();
  // Moving on closes it
  await page.click('[data-tour="next"]');
  await expect(page.locator('#popover')).toBeHidden();
  await expect(page.locator('.tour-tip h3')).toHaveText('Weeks and activities');
  // Ending the tour puts the ⋮ away
  await page.keyboard.press('Escape');
  await expect(page.locator('.tour-layer')).toHaveCount(0);
  // The ⋮ is a normal hover control again: it goes when the pointer leaves the program
  await page.mouse.move(5, 300);
  await expect(page.locator('#rowHandle')).toBeHidden();
});

test('the ? beside Export shows the tour again', async ({ page }) => {
  await page.addInitScript(() => { if (!localStorage.getItem('scoutProgramBuilder.welcome')) localStorage.setItem('scoutProgramBuilder.welcome', 'done'); });
  await page.goto('/');
  await page.waitForFunction(() => typeof state === 'object');
  const help = page.locator('#btnHelp');
  await expect(help).toHaveAttribute('aria-label', 'Help: take the tour');
  await expect(help).toHaveText('');
  // Just right of Export
  const h = await help.boundingBox(), x = await page.locator('#btnExport').boundingBox();
  expect(h.x).toBeGreaterThan(x.x + x.width);
  expect(Math.abs(h.y + h.height / 2 - (x.y + x.height / 2))).toBeLessThan(2);
  await help.click();
  await expect(page.locator('.tour-count')).toHaveText('1 of 9');
  await page.keyboard.press('Escape');
  await expect(page.locator('.tour-layer')).toHaveCount(0);
});

test("the Program files highlight stops short of the Export button", async ({ page }) => {
  await page.addInitScript(() => { if (!localStorage.getItem('scoutProgramBuilder.welcome')) localStorage.setItem('scoutProgramBuilder.welcome', 'done'); });
  await page.goto('/');
  await page.waitForFunction(() => typeof state === 'object');
  await page.click('#btnHelp');
  for (let i = 0; i < 7; i++) await page.click('[data-tour="next"]');
  await expect(page.locator('.tour-tip h3')).toHaveText('Program files');
  await expect.poll(async () => {
    const spot = await page.locator('.tour-spot').boundingBox();
    const exp = await page.locator('#btnExport').boundingBox();
    return spot.x + spot.width + 2 <= exp.x;     // its ring is 2px wide
  }).toBe(true);
});
