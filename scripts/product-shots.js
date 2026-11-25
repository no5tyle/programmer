// Screenshots for the Program Builder's page on qstored.org (no5tyle/qstored: shots/program-builder, made into site/img/products/program-builder):
//
//   node scripts/product-shots.js ../qstored/shots/program-builder --family
//
// The builder runs from this folder, signed in with Premium, against the tests' stand-in for the API
// (tests/account-helpers.js), so nothing else needs to be running. The family page is drawn by the API's own
// renderer: with no5tyle/programmer-api beside this folder, `node scripts/product-shots.js <out> --family` also
// makes it (it needs that repo's dependencies installed).
// Then in no5tyle/qstored: `python3 scripts/product-images.py` makes them the right size for the site.
const { spawn, execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { chromium, devices } = require('@playwright/test');
const { program, mockAccount, openAccountApp, edit, SIGN_IN_LINK } = require('../tests/account-helpers');

const root = path.join(__dirname, '..');
const OUT = path.resolve(process.argv[2] || 'product-shots');
const port = 8798;
const BASE = `http://localhost:${port}`;
const EXAMPLE = require('../examples/example-program.json');

/** The example program in other sections and terms, for the programs list. */
function others() {
  const make = (id, section, sectionName, color, year, term) => program(id, {
    ...EXAMPLE, branding: { ...EXAMPLE.branding, section, sectionName, color }, term: { ...EXAMPLE.term, year, term },
  }, { name: `${sectionName} Program – Term ${term} ${year}`, section, year, term });
  const library = (p, unit) => ({ ...p, owner: 'group:g1', unit, data: { ...p.data, unit } });
  // Their own units (an Individual plan): each with a program a term
  const own = (p, unit) => ({ ...p, unit, data: { ...p.data, unit } });
  return [own(make('joey1111', 'joeys', 'Joeys', '#A05A2C', 2027, 1), 'myjoeys'), own(make('cubs2026', 'cubs', 'Cubs', '#FFC82E', 2026, 4), 'mycubs'),
    // The group's library: kept by the group under its units, open to every leader in it
    library(make('scout111', 'scouts', 'Scouts', '#00AE42', 2027, 1), 'kingfisher'),
    library(make('scout112', 'scouts', 'Scouts', '#00AE42', 2026, 4), 'kingfisher'),
    library(make('cubs3333', 'cubs', 'Cubs', '#FFC82E', 2027, 1), 'banksia')];
}

/** The group's units and styling, set on the group site's Programs page. */
const LIBRARY = {
  units: [{ id: 'banksia', name: 'Banksia Cubs', section: 'cubs' }, { id: 'kingfisher', name: 'Kingfisher Troop', section: 'scouts' }],
  styling: { shared: { groupName: '1st Wattle Creek Scout Group', font: 'Nunito' }, sections: {} },
  region: 'SA',
  // The group's spaces in Quarters Master, for Where
  spaces: [{ id: 'den', name: 'Den', shared: true }, { id: 'hall', name: 'Main hall', shared: false }],
};

/** The group, with the Group plan, whose library is in the list. */
const GROUP = { id: 'g1', name: '1st Wattle Creek', role: 'owner', gearRole: 'quartermaster', plan: true };

async function fonts(page) {
  await page.evaluate(async () => {
    const faces = ['400', '600', '700', '800'].flatMap((w) => [`${w} 12px Nunito`, `italic ${w} 12px Nunito`, `${w} 12px Inter`]);
    await Promise.all(faces.map((f) => document.fonts.load(f).catch(() => null)));
    await document.fonts.ready;
    if (typeof fit === 'function') fit();
  });
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const server = spawn(process.execPath, [path.join(root, 'tests', 'serve.js')], { env: { ...process.env, PORT: String(port) }, stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 800));
  const browser = await chromium.launch({ args: ['--lang=en-AU'], env: { ...process.env, LANG: 'en_AU.UTF-8', LANGUAGE: 'en_AU' } });
  const shot = async (page, name, opts = {}) => { await page.waitForTimeout(500); await page.screenshot({ path: path.join(OUT, `${name}.png`), ...opts }); console.log(name); };
  try {
    const options = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, locale: 'en-AU', timezoneId: 'Australia/Adelaide', baseURL: BASE };

    // The first visit: the set-up wizard
    const first = await browser.newPage(options);
    await first.goto('/');
    await first.waitForSelector('.welcome, #welcome, [data-welcome]', { timeout: 10000 }).catch(() => null);
    await shot(first, 'welcome');
    await first.close();

    // Signed in, with Premium: the example and a few more programs
    const ctx = await browser.newContext(options);
    const page = await ctx.newPage();
    const server2 = await mockAccount(page, { signedIn: true, limit: null, groups: [GROUP], programs: [program('prog1111', { ...EXAMPLE, unit: 'mycubs' }, { version: 3, unit: 'mycubs' }), ...others()] });
    server2.mode = 'units';
    server2.own = { units: [{ id: 'myjoeys', name: 'Joeys', section: 'joeys' }, { id: 'mycubs', name: 'Cubs', section: 'cubs' }], region: 'SA' };
    // The Cubs' live link is on, with this program published
    server2.links.set('cubs', { slug: 'Xk3pQ9vL2mTa7Rw4Yh8sZc1N', showPhones: false, pinned: null });
    server2.libraries.set('g1', LIBRARY);
    server2.published.set('prog1111', 3);
    await openAccountApp(page, SIGN_IN_LINK);
    await page.waitForSelector('#saveState span:has-text("Saved to your account")');
    await page.evaluate(() => openProgram('prog1111'));
    await page.waitForFunction(() => library.current === 'prog1111');
    await fonts(page);
    await page.locator('.toast').evaluateAll((ts) => ts.forEach((t) => t.remove()));
    await page.click('#sheet tbody tr:nth-child(4) td.c-description .ed');
    await shot(page, 'editor');

    await page.keyboard.press('Escape');
    // The page families get, close up
    await page.evaluate(() => { document.activeElement?.blur(); window.getSelection()?.removeAllRanges(); });
    await page.mouse.move(5, 880);
    await page.waitForTimeout(300);
    await page.locator('#sheet').screenshot({ path: path.join(OUT, 'printout.png') });
    console.log('printout');
    // Working on it together, in the group's library (a Group plan feature): another leader in the program, in the cell
    // they're changing
    await page.evaluate(() => openProgram('cubs3333'));
    await page.waitForFunction(() => library.current === 'cubs3333' && document.querySelector('#sheet tr[data-id]'));
    await fonts(page);
    const nights = await page.evaluate(() => state.rows.filter((r) => document.querySelector(`#sheet tr[data-id="${r.id}"] td.c-activity .ed`)).map((r) => r.id));
    server2.otherHere('cubs3333', { id: 'u2', name: 'Baloo', tab: 'baloosTab1' }, `${nights[3]}:activity`);
    server2.otherHere('cubs3333', { id: 'u3', name: 'Raksha', tab: 'rakshaTab1' }, null);
    await page.evaluate(() => liveLook());
    await page.waitForSelector('#livePeople .live-avatar:nth-child(2)');
    await page.waitForSelector('#sheet td.live-cell .live-tag');
    await page.locator('.toast').evaluateAll((ts) => ts.forEach((t) => t.remove()));
    await shot(page, 'together', { clip: { x: 260, y: 0, width: 1180, height: 640 } });
    server2.otherLeaves('cubs3333');
    server2.otherLeaves('cubs3333', 'rakshaTab1');
    await page.evaluate(() => liveLook());
    await page.waitForSelector('#livePeople', { state: 'hidden' });

    // Where: the group's spaces, each night booked on its Facilities calendar (a hire in the way of one)
    await page.evaluate(() => { state.columns.find((c) => c.key === 'where').visible = true; setSettingsOpen?.(false); save(); renderAll(); });
    server2.clashes = { [nights[1]]: { title: 'Yoga class', startAt: '2027-02-08T19:00', endAt: '2027-02-08T21:00' } };
    for (const id of nights.slice(0, 4)) {
      await page.locator(`#sheet tr[data-id="${id}"] td.c-where`).click();
      await page.click('.popover [data-space="hall"]');
    }
    await page.evaluate(() => publishCurrent());
    await page.waitForSelector('#sheet td.c-where.night-confirmed');
    await page.locator('.toast').evaluateAll((ts) => ts.forEach((t) => t.remove()));
    await page.locator(`#sheet tr[data-id="${nights[1]}"] td.c-where`).click();
    await page.waitForTimeout(300);
    await shot(page, 'where', { clip: { x: 260, y: 160, width: 1180, height: 640 } });
    await page.keyboard.press('Escape');
    await page.evaluate(() => openProgram('prog1111'));
    await page.waitForFunction(() => library.current === 'prog1111');
    await page.click('#btnExport');
    await shot(page, 'export');
    await page.keyboard.press('Escape');

    // Notes for a row: the leaders' own, and details for families, in place of the settings
    await page.evaluate(() => {
      const r = state.rows.find((x) => x.activity === 'Knots for Camp');
      r.leaderNotes = 'Baloo brings the rope box from the store.\nPractise the bowline first: we need it for camp.';
      r.details = 'We\'re learning the knots we\'ll use at camp.\n\nOlder Cubs: bring a length of rope if you have one.';
      save(); renderAll(); openNotes(r.id);
    });
    await page.locator('.toast').evaluateAll((ts) => ts.forEach((t) => t.remove()));
    await page.mouse.move(5, 880);
    await shot(page, 'notes', { clip: { x: 260, y: 0, width: 1180, height: 760 } });
    await page.evaluate(() => closeNotes());

    // A change waiting to be published
    await edit(page, 'Welcome Back Games');
    await page.waitForSelector('#btnPublish:not([hidden])');
    await page.locator('.toast').evaluateAll((ts) => ts.forEach((t) => t.remove()));
    await shot(page, 'publish-bar', { clip: { x: 0, y: 0, width: 1440, height: 64 } });
    await page.click('#btnExport');
    await page.click('[data-export="live"]');
    await page.waitForSelector('#shareUrl');
    await shot(page, 'share');
    await page.click('.modal button:has-text("Done")');

    await edit(page, 'Welcome Back Games and Pack Meeting');
    await page.click('#btnHistory');
    await page.waitForSelector('.modal h2:has-text("Version history")');
    await shot(page, 'history');
    await page.keyboard.press('Escape');

    // Programs, by section, on the left, with the group's library under them
    await shot(page, 'programs', { clip: { x: 0, y: 0, width: 720, height: 900 } });

    // The group's library: moving this program into one of the group's units
    await page.click('#btnDirMove');
    await page.waitForSelector('.modal h2:has-text("library")');
    await shot(page, 'library');
    await page.keyboard.press('Escape');
    await ctx.close();

    // On a phone
    const { defaultBrowserType, ...iphone } = devices['iPhone 13'];
    const phone = await browser.newContext({ ...iphone, locale: 'en-AU', timezoneId: 'Australia/Adelaide', baseURL: BASE });
    const q = await phone.newPage();
    await mockAccount(q, { signedIn: true, limit: null, programs: [program('prog1111', EXAMPLE, { version: 3 })] });
    await openAccountApp(q, SIGN_IN_LINK);
    await q.waitForFunction(() => library.current === 'prog1111');
    await fonts(q);
    await q.locator('.toast').evaluateAll((ts) => ts.forEach((t) => t.remove()));
    await shot(q, 'phone');
    await phone.close();

    // The family page, drawn by the API's renderer
    if (process.argv.includes('--family')) {
      const api = path.join(root, '..', 'programmer-api');
      const html = path.join(OUT, 'family.html');
      const withDetails = { ...EXAMPLE, rows: EXAMPLE.rows.map((r) => r.activity === 'Knots for Camp' ? { ...r, details: "We're learning the knots we'll use at camp.\n\nOlder Cubs: bring a length of rope if you have one." } : r) };
      const script = path.join(OUT, 'family.mts');
      fs.writeFileSync(script, `import { writeFileSync } from 'node:fs';
import { familyPage } from ${JSON.stringify(path.join(api, 'src', 'family.ts'))};
const data = ${JSON.stringify(withDetails)};
writeFileSync(${JSON.stringify(html)}, familyPage(data, { showPhones: false, calendarUrl: 'webcal://api.qstored.org/p/x.ics', calendarFileUrl: 'https://api.qstored.org/p/x.ics', updatedAt: new Date() }));
`);
      execFileSync(path.join(api, 'node_modules', '.bin', 'tsx'), [script], { cwd: api, stdio: 'inherit' });
      const fp = await browser.newPage({ ...iphone, locale: 'en-AU' });
      await fp.goto(`file://${html}`);
      await shot(fp, 'family-phone');
      const fd = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 });
      await fd.goto(`file://${html}`);
      await shot(fd, 'family');
      fs.rmSync(html); fs.rmSync(script);
    }
  } finally {
    await browser.close();
    server.kill();
  }
})().catch((e) => { console.error(e); process.exit(1); });
