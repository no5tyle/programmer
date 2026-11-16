// Accounts on a phone: Sign in, Account and Sign out are in the menu.
const { test, expect, devices } = require('@playwright/test');
const { program, mockAccount, openAccountApp, SIGN_IN_LINK } = require('./account-helpers');

const EXAMPLE = require('../examples/example-program.json');
const { defaultBrowserType, ...iPhone } = devices['iPhone 13'];
test.use({ ...iPhone, browserName: 'chromium' });

let errors;
test.afterEach(() => { expect(errors, 'browser errors').toEqual([]); });

test('the menu has Sign in, then Account and Sign out', async ({ page }) => {
  await mockAccount(page);
  errors = await openAccountApp(page);
  await page.click('#mMenu');
  await expect(page.locator('[data-m="programs"]')).toContainText('Sign in to keep more');
  await page.click('[data-m="signin"]');
  await expect(page.locator('.modal h2')).toHaveText('Sign in');
});

test('signed in, the menu opens the qstored account site', async ({ page, context }) => {
  await mockAccount(page, { signedIn: true, programs: [program('prog1111', EXAMPLE)] });
  errors = await openAccountApp(page, SIGN_IN_LINK);
  await expect.poll(() => page.evaluate(() => library.current)).toBe('prog1111');
  await page.click('#mMenu');
  await expect(page.locator('[data-m="account"]')).toContainText('akela@example.com');
  await expect(page.locator('[data-m="signout"]')).toBeVisible();
  await expect(page.locator('[data-m="account"]')).toContainText('account.qstored.org');
  await context.route('https://account.qstored.org/**', (route) => route.fulfill({ contentType: 'text/html', body: '<p>account</p>' }));
  const [tab] = await Promise.all([context.waitForEvent('page'), page.click('[data-m="account"]')]);
  await tab.waitForLoadState();
  expect(tab.url()).toBe('https://account.qstored.org/');
});
