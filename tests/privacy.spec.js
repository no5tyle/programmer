// What the page may load (its Content-Security-Policy), and the note asking leaders to keep young
// people's details out of programs (docs/premium-plan.md, section 5).
const { test, expect } = require('@playwright/test');
const { openApp, fillCubs } = require('./helpers');

/** Records anything the page's policy blocks, from before the page's own scripts run. */
async function watchPolicy(page) {
  await page.addInitScript(() => {
    window.blocked = [];
    document.addEventListener('securitypolicyviolation', (e) => window.blocked.push(`${e.violatedDirective} ${e.blockedURI}`));
  });
}

test('the policy lets no script in from anywhere but the app, the app switcher and the PDF libraries', async ({ page }) => {
  await page.goto('/');
  const policy = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
  const scripts = /script-src ([^;]+)/.exec(policy)[1].trim().split(/\s+/);
  expect(scripts).toEqual(["'self'", 'https://no5tyle.github.io', 'https://cdnjs.cloudflare.com']);
  expect(policy).toContain("object-src 'none'");
});

test('nothing the builder does is blocked by the policy: editing, help, Save file and the PDF', async ({ page }) => {
  await watchPolicy(page);
  const errors = await openApp(page);
  await fillCubs(page);
  await page.click('#btnHelp');
  await page.keyboard.press('Escape');
  await page.click('#btnExport');
  await page.keyboard.press('Escape');
  const pdf = await page.evaluate(async () => (await buildPdf()).size);
  expect(pdf).toBeGreaterThan(10_000);
  // The example activities come from the site itself
  await page.evaluate(() => fillExampleActivities?.());
  expect(await page.evaluate(() => window.blocked)).toEqual([]);
  expect(errors).toEqual([]);
});

test('a logo or icon chosen from a file shows, under the policy', async ({ page }) => {
  await watchPolicy(page);
  const errors = await openApp(page);
  await page.evaluate(() => {
    const c = document.createElement('canvas'); c.width = 40; c.height = 40;
    c.getContext('2d').fillRect(0, 0, 40, 40);
    state.branding.logo = c.toDataURL('image/png');
    renderAll();
  });
  await expect(page.locator('#sheet .doc-logo img')).toHaveJSProperty('complete', true);
  expect(await page.locator('#sheet .doc-logo img').evaluate((img) => img.naturalWidth)).toBe(40);
  expect(await page.evaluate(() => window.blocked)).toEqual([]);
  expect(errors).toEqual([]);
});

test('asks leaders to keep young people\'s details out, under the program but not on the printout', async ({ page }) => {
  await openApp(page);
  await expect(page.locator('#privacyNote')).toContainText("keep young people's names");
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('#privacyNote')).toBeHidden();
});
