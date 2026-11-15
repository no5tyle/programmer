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
  await page.click('[data-section="scouts"]');
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
    const tip = await page.locator('.tour-tip').boundingBox();
    const vp = page.viewportSize();
    expect(tip.x).toBeGreaterThanOrEqual(0);
    expect(tip.y).toBeGreaterThanOrEqual(0);
    expect(tip.x + tip.width).toBeLessThanOrEqual(vp.width);
    expect(tip.y + tip.height).toBeLessThanOrEqual(vp.height);
    await page.click('[data-tour="next"]');
  }
  await expect(page.locator('.tour-layer')).toHaveCount(0);
}

test('first visit: setup wizard, then the tour', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/');
  await runWizard(page);
  const b = await page.evaluate(() => state.branding);
  expect(b.groupName).toBe('1st Example Scout Group');
  expect([b.section, b.sectionName]).toEqual(['scouts', 'Scouts']);
  expect(b.leaders).toEqual([{ name: 'Akela', phone: '0400 000 001' }, { name: 'Baloo', phone: '' }]);
  await expect(page.locator('#sheet')).toContainText('Akela');
  await stepThroughTour(page, 6);

  // Not shown again, and the tour can be taken from the sidebar
  await page.reload();
  await page.waitForFunction(() => typeof state === 'object');
  await expect(page.locator('.wz-backdrop')).toHaveCount(0);
  expect(await page.evaluate(() => state.branding.groupName)).toBe('1st Example Scout Group');
  await page.click('#btnTour');
  await expect(page.locator('.tour-count')).toHaveText('1 of 6');
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
