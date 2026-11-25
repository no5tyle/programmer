// Accounts: signing in, saving to the account, offline, clashes, and the limits (docs/premium-plan.md, section 4).
// The API and Firebase are stood in for by tests/account-helpers.js.
const path = require('path');
const { test, expect } = require('@playwright/test');
const { openApp } = require('./helpers');
const { program, mockAccount, openAccountApp, edit, SIGN_IN_LINK } = require('./account-helpers');

const EXAMPLE = require('../examples/example-program.json');
const exampleFile = path.join(__dirname, '..', 'examples', 'example-program.json');
const saveState = (page) => page.locator('#saveState span');
const currentData = (server, page) => page.evaluate(() => library.current).then((id) => server.programs.get(id)?.data);

let errors;
test.afterEach(() => { expect(errors, 'browser errors').toEqual([]); });

test('with no account settings, there is no Sign in and programs stay in the browser', async ({ page }) => {
  errors = await openApp(page);
  await expect(page.locator('#btnAccount')).toBeHidden();
  await expect(saveState(page)).toHaveText('All changes saved');
  await expect(page.locator('#dirWhere')).toHaveText('In this browser');
  await expect(page.locator('[data-dir-signin]')).toHaveCount(0);
});

test.describe('signed out', () => {
  test.beforeEach(async ({ page }) => {
    await mockAccount(page);
    errors = await openAccountApp(page);
  });

  test('the sidebar says the program saves on this device', async ({ page }) => {
    await expect(page.locator('#saveWhere')).toContainText('saves on this device');
  });

  test('says the program is saved on this device, and offers Sign in', async ({ page }) => {
    await expect(page.locator('#btnAccount')).toHaveText('Sign in');
    await edit(page, 'Night hike');
    await expect(saveState(page)).toHaveText('Saved on this device');
    await expect(page.locator('#directory .dir-item')).toHaveCount(1);
    await expect(page.locator('#directory .dir-signin')).toContainText('Sign in to save your program to your account');
    await page.click('[data-dir-signin]');
    await expect(page.locator('.modal h2')).toHaveText('Sign in');
  });

  test('keeps one program: New, Duplicate and Open ask to sign in or replace it', async ({ page }) => {
    await edit(page, 'Night hike');
    const first = await page.evaluate(() => library.current);

    await page.click('#btnDirDup');
    await expect(page.locator('.modal h2')).toHaveText('This device keeps one program');
    await page.click('.modal button:has-text("Cancel")');
    expect(await page.evaluate(() => library.items.length)).toBe(1);

    // New program: replace it, then choose the term as usual
    await page.click('#btnDirNew');
    await page.click('.modal button:has-text("Replace it")');
    await expect(page.locator('.modal-body')).toContainText("takes this one's place");
    await page.click('.modal [data-i="1"]');
    expect(await page.evaluate(() => [library.items.length, state.rows[0].activity])).toEqual([1, '']);
    expect(await page.evaluate(() => library.current)).not.toBe(first);
    expect(await page.evaluate((id) => localStorage.getItem(`scoutProgramBuilder.program.${id}`), first)).toBeNull();

    // Opening a file replaces it too, after asking, and Save file is offered first
    await page.click('#btnImport');
    await page.setInputFiles('#fileJson', exampleFile);
    await expect(page.locator('.modal h2')).toHaveText('Replace your program?');
    await expect(page.locator('.modal button:has-text("Save file")')).toBeVisible();
    await page.click('.modal button:has-text("Replace it")');
    await expect.poll(() => page.evaluate(() => state.branding.groupName)).toBe(EXAMPLE.branding.groupName);
    expect(await page.evaluate(() => library.items.length)).toBe(1);
    await page.reload();
    await page.waitForFunction(() => typeof state === 'object');
    expect(await page.evaluate(() => state.branding.groupName)).toBe(EXAMPLE.branding.groupName);
  });
});

test.describe('signing in', () => {
  test('emails a link, and the link signs in and offers to add the program on this device', async ({ page }) => {
    const server = await mockAccount(page);
    errors = await openAccountApp(page);
    await edit(page, 'Night hike');

    await page.click('#btnAccount');
    // The email field looks like the app's other fields
    const field = page.locator('#askInput');
    await expect(field).toHaveAttribute('type', 'email');
    const look = (sel) => page.locator(sel).first().evaluate((el) => {
      const cs = getComputedStyle(el); return [cs.height, cs.borderTopWidth, cs.borderTopLeftRadius, cs.backgroundColor];
    });
    expect(await look('#askInput')).toEqual(await look('#sidebar input[type=text]'));
    await page.fill('#askInput', 'not an email');
    await page.keyboard.press('Enter');
    await expect(page.locator('.toast.error')).toContainText('enter your email');
    await page.fill('#askInput', 'akela@example.com');
    await page.keyboard.press('Enter');
    await expect(page.locator('.modal h2')).toHaveText("We've sent you a link");
    const sent = JSON.parse(server.sent[0].body);
    expect(sent).toMatchObject({ requestType: 'EMAIL_SIGNIN', email: 'akela@example.com', canHandleCodeInApp: true });
    expect(sent.continueUrl).toBe('http://localhost:8765/');

    // The link in the email comes back to the builder with a code
    await page.goto('/?mode=signIn&oobCode=good-code&apiKey=test-key&lang=en');
    await expect(page.locator('.modal h2')).toHaveText('Add this program to your account?');
    expect(page.url()).toBe('http://localhost:8765/');
    await page.click('.modal button:has-text("Add to my account")');
    await expect(saveState(page)).toHaveText('Saved to your account');
    await expect(page.locator('#btnAccount .avatar')).toHaveText('A');
    expect(server.live()).toHaveLength(1);
    expect((await currentData(server, page)).rows[0].activity).toBe('Night hike');

    // Still signed in after a reload, with nothing sent again
    const posts = server.called('POST /programs').length;
    await page.reload();
    await expect(page.locator('#btnAccount .avatar')).toBeVisible();
    await expect(saveState(page)).toHaveText('Saved to your account');
    expect(server.called('POST /programs')).toHaveLength(posts);
  });

  test('a program left out stays on this device only, and can be added later', async ({ page }) => {
    const server = await mockAccount(page);
    errors = await openAccountApp(page);
    await edit(page, 'Night hike');
    await page.evaluate(() => localStorage.setItem('qstored.pendingEmail', 'akela@example.com'));
    await page.goto('/?mode=signIn&oobCode=good-code');
    await page.click('.modal button:has-text("Not now")');
    await expect(saveState(page)).toHaveText('Saved on this device only');
    await edit(page, 'Day hike');
    await expect(saveState(page)).toHaveText('Saved on this device only');
    expect(server.live()).toHaveLength(0);

    await expect(page.locator('#directory .dir-head').last()).toContainText('On this device only');
    await expect(page.locator('#directory .dir-item span')).toContainText('on this device only');
    await page.hover('#directory .dir-row');
    await page.click('#directory [data-addprog]');
    await expect(saveState(page)).toHaveText('Saved to your account');
    expect((await currentData(server, page)).rows[0].activity).toBe('Day hike');
  });

  test('on another device, the link asks for the email, and opens the newest program in the account', async ({ page }) => {
    const server = await mockAccount(page, {
      programs: [
        program('older111', { ...EXAMPLE, branding: { ...EXAMPLE.branding, groupName: 'Older' } }, { updatedAt: '2026-01-01T00:00:00.000Z' }),
        program('newer222', EXAMPLE, { version: 4 }),
      ],
    });
    errors = await openAccountApp(page, '/?mode=signIn&oobCode=good-code');
    await expect(page.locator('.modal h2')).toHaveText('Finish signing in');
    await page.fill('#askInput', 'akela@example.com');
    await page.click('.modal .btn-primary');

    // The untouched starter program isn't added; the account's newest program is shown
    await expect.poll(() => page.evaluate(() => [library.current, state.branding.groupName])).toEqual(['newer222', EXAMPLE.branding.groupName]);
    await expect(page.locator('.modal-backdrop')).toBeHidden();
    expect(server.called('POST /programs')).toEqual([]);
    await expect(page.locator('#dirWhere')).toHaveText('In your account');
    await expect(page.locator('#directory .dir-item')).toHaveCount(2);
  });

  test('a used link says so, and stays signed out', async ({ page }) => {
    await mockAccount(page);
    await page.addInitScript(() => localStorage.setItem('qstored.pendingEmail', 'akela@example.com'));
    errors = await openAccountApp(page, '/?mode=signIn&oobCode=used-code');
    await expect(page.locator('.toast.error')).toContainText('has been used or has run out');
    await expect(page.locator('#btnAccount')).toHaveText('Sign in');
  });
});

test.describe('one sign-in for every qStored site', () => {
  const sharedCookie = async (context) => (await context.cookies()).find((c) => c.name === 'qstored_session');

  test('signing in here shares the sign-in, and signing out ends it everywhere', async ({ page, context }) => {
    await mockAccount(page, { signedIn: true });
    errors = await openAccountApp(page, SIGN_IN_LINK);
    await expect(page.locator('#btnAccount .avatar')).toBeVisible();
    expect(JSON.parse(decodeURIComponent((await sharedCookie(context)).value)))
      .toEqual({ uid: 'u1', email: 'akela@example.com', refreshToken: 'refresh-1' });
    await page.click('#btnAccount');
    await page.click('#pSignOut');
    await expect(page.locator('#btnAccount')).toHaveText('Sign in');
    expect(await sharedCookie(context)).toBeUndefined();
  });

  test('a sign-in from another qStored site is a first sign-in here', async ({ page, context }) => {
    const server = await mockAccount(page, { programs: [program('acct1111', EXAMPLE)] });
    await context.addCookies([{
      name: 'qstored_session', domain: 'localhost', path: '/',
      value: encodeURIComponent(JSON.stringify({ uid: 'u1', email: 'akela@example.com', refreshToken: 'refresh-1' })),
    }]);
    errors = await openAccountApp(page);
    await expect(page.locator('#btnAccount .avatar')).toHaveText('A');
    await expect.poll(() => page.evaluate(() => library.current)).toBe('acct1111');
    await expect(page.locator('#dirWhere')).toHaveText('In your account');
    expect(server.called('POST /programs')).toEqual([]);
  });

  test("while the account's programs are on their way, the list says it's loading, not that there are none", async ({ page, context }) => {
    await mockAccount(page, { programs: [program('acct1111', EXAMPLE)] });
    await context.addCookies([{
      name: 'qstored_session', domain: 'localhost', path: '/',
      value: encodeURIComponent(JSON.stringify({ uid: 'u1', email: 'akela@example.com', refreshToken: 'refresh-1' })),
    }]);
    // The account's list of programs, held back until the test lets it go
    let release;
    const held = new Promise((r) => { release = r; });
    await page.route(/\/programs\?owner=/, async (route) => { await held; await route.fallback(); });
    errors = await openAccountApp(page);
    await expect(page.locator('#dirList .dir-loading')).toHaveText('Loading your programs…');
    await expect(page.locator('#dirList .spinner')).toBeVisible();
    await expect(page.locator('#dirList')).not.toContainText('No programs yet');
    release();
    await expect(page.locator('#dirList .dir-item')).toHaveCount(1);
    await expect(page.locator('#dirList .dir-loading')).toHaveCount(0);
  });

  test('signed out on another qStored site, the programs here stay', async ({ page, context }) => {
    await mockAccount(page, { signedIn: true });
    errors = await openAccountApp(page, SIGN_IN_LINK);
    await expect(page.locator('#btnAccount .avatar')).toBeVisible();
    await edit(page, 'Night hike');
    await context.clearCookies();
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await expect(page.locator('#btnAccount')).toHaveText('Sign in');
    await expect.poll(() => page.evaluate(() => { try { return state.rows[0].activity; } catch { return null; } })).toBe('Night hike');
  });
});

test.describe('Sign in with Microsoft', () => {
  test('is offered only once it is switched on', async ({ page }) => {
    await mockAccount(page);
    errors = await openAccountApp(page);
    await page.click('#btnAccount');
    await expect(page.locator('.modal .btn-ms')).toHaveCount(0);
  });

  test('signs in with a Microsoft account, and offers to add the program on this device', async ({ page }) => {
    const server = await mockAccount(page, { microsoft: true });
    errors = await openAccountApp(page);
    await edit(page, 'Night hike');
    await page.click('#btnAccount');
    await expect(page.locator('.modal .btn-ms')).toHaveText('Sign in with Microsoft');
    await expect(page.locator('.modal-body')).toContainText('Sign in with your Microsoft account, or get a link');
    await page.click('.modal .btn-ms');
    // Off to Microsoft and back: the page finishes signing in
    await expect(page.locator('.modal h2')).toHaveText('Add this program to your account?');
    expect(page.url()).toBe('http://localhost:8765/');
    const start = JSON.parse(server.sent.find((s) => s.url.includes('createAuthUri')).body);
    expect(start).toMatchObject({ providerId: 'microsoft.com', continueUri: 'http://localhost:8765/', customParameter: { prompt: 'select_account' } });
    const finish = JSON.parse(server.sent.find((s) => s.url.includes('signInWithIdp')).body);
    expect(finish).toMatchObject({ sessionId: 'session-ms', returnSecureToken: true });
    expect(finish.requestUri).toContain('code=ms-code');
    await page.click('.modal button:has-text("Add to my account")');
    await expect(page.locator('#btnAccount .avatar')).toBeVisible();
    await expect(saveState(page)).toHaveText('Saved to your account');
    expect((await currentData(server, page)).rows[0].activity).toBe('Night hike');
  });

  test('cancelled at Microsoft, says so and stays signed out', async ({ page }) => {
    const server = await mockAccount(page, { microsoft: true });
    server.microsoft = 'cancel';
    errors = await openAccountApp(page);
    await page.click('#btnAccount');
    await page.click('.modal .btn-ms');
    await expect(page.locator('.toast.error')).toHaveText('Microsoft sign-in was cancelled.');
    await expect(page.locator('#btnAccount')).toHaveText('Sign in');
    expect(page.url()).toBe('http://localhost:8765/');
  });

  test('a Microsoft account with no email address is turned away', async ({ page }) => {
    const server = await mockAccount(page, { microsoft: true });
    server.microsoft = 'noemail';
    errors = await openAccountApp(page);
    await page.click('#btnAccount');
    await page.click('.modal .btn-ms');
    await expect(page.locator('.toast.error')).toContainText('no email address');
    await expect(page.locator('#btnAccount')).toHaveText('Sign in');
  });

  test('an email that already has an account signs in by email link once, and Microsoft is linked to it', async ({ page }) => {
    const server = await mockAccount(page, { microsoft: true });
    server.microsoft = 'existing';
    errors = await openAccountApp(page);
    await page.click('#btnAccount');
    await page.click('.modal .btn-ms');
    await expect(page.locator('.modal h2')).toHaveText('Sign in with your email once');
    await expect(page.locator('.modal-body')).toContainText('akela@example.com');
    await page.click('.modal button:has-text("Email me a link")');
    await expect(page.locator('.modal h2')).toHaveText("We've sent you a link");
    expect(server.sent.some((s) => s.url.includes('sendOobCode') && s.body.includes('akela@example.com'))).toBe(true);
    await page.click('.modal button:has-text("OK")');

    // The link in the email: signs in, then links Microsoft with what Firebase gave back
    await page.goto(SIGN_IN_LINK);
    await expect.poll(() => server.linked).toBe(true);
    await expect(page.locator('.toast', { hasText: 'Microsoft is linked' })).toBeVisible();
    const link = JSON.parse(server.sent.filter((s) => s.url.includes('signInWithIdp')).pop().body);
    expect(link).toMatchObject({ idToken: expect.stringMatching(/^token-/), pendingToken: 'pending-ms' });
    expect(await page.evaluate(() => localStorage.getItem('qstored.linkMicrosoft'))).toBeNull();
  });
});

test.describe('signed in', () => {
  const open = async (page, options = {}) => {
    const server = await mockAccount(page, { signedIn: true, programs: [program('prog1111', EXAMPLE, { version: 3 })], ...options });
    errors = await openAccountApp(page, SIGN_IN_LINK);
    await expect.poll(async () => server.programs.has(await page.evaluate(() => library.current))).toBe(true);
    await expect(saveState(page)).toHaveText('Saved to your account');
    expect(server.called('PUT'), 'opening a program changes nothing').toEqual([]);
    return server;
  };

  test('changes are sent to the account, against the version they were based on', async ({ page }) => {
    const server = await open(page);
    await edit(page, 'Night hike');
    await expect.poll(() => server.programs.get('prog1111').version).toBe(4);
    await expect(saveState(page)).toHaveText('Saved to your account');
    expect(server.programs.get('prog1111').data.rows[0].activity).toBe('Night hike');

    // Coming back to the page, or reopening it, sends nothing more
    const puts = server.called('PUT').length;
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));   // coming back to the page catches up
    await page.reload();
    await expect(saveState(page)).toHaveText('Saved to your account');
    expect(server.called('PUT')).toHaveLength(puts);
  });

  test('offline, changes wait on this device and upload when the connection is back', async ({ page }) => {
    const server = await open(page);
    server.offline = true;
    await edit(page, 'Campfire');
    await expect(saveState(page)).toHaveText("Offline: saved on this device, will upload when you're back online");

    // Still there after closing and reopening with no connection
    await page.reload();
    await page.waitForFunction(() => typeof state === 'object');
    expect(await page.evaluate(() => state.rows[0].activity)).toBe('Campfire');
    await expect(saveState(page)).toHaveText("Offline: saved on this device, will upload when you're back online");

    server.offline = false;
    await expect.poll(() => server.programs.get('prog1111').data.rows[0].activity).toBe('Campfire');
    await expect(saveState(page)).toHaveText('Saved to your account');
  });

  test('takes the newer copy when the program was changed on another device', async ({ page }) => {
    const server = await open(page);
    const p = server.programs.get('prog1111');
    Object.assign(p, { version: 9, data: { ...p.data, branding: { ...p.data.branding, groupName: 'Changed elsewhere' } } });
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await expect.poll(() => page.evaluate(() => state.branding.groupName)).toBe('Changed elsewhere');
    await expect(page.locator('#sheet')).toContainText('Changed elsewhere');

    // ...and the next change is saved on top of it
    await edit(page, 'Night hike');
    await expect.poll(() => p.version).toBe(10);
    expect(p.data.branding.groupName).toBe('Changed elsewhere');
  });

  test.describe('when the same program was changed in two places, with no starting copy here to put them together', () => {
    const clash = async (page) => {
      const server = await open(page);
      // Its starting copy (kept since it was opened) is gone, as on a device the builder's older version left
      await page.evaluate(() => localStorage.removeItem('scoutProgramBuilder.base.prog1111'));
      const p = server.programs.get('prog1111');
      const theirs = JSON.parse(JSON.stringify(p.data));
      theirs.rows[0].activity = 'Theirs';
      Object.assign(p, { version: 4, data: theirs, name: 'Their name' });
      await edit(page, 'Mine');
      await expect(page.locator('.modal h2')).toHaveText('This program was changed somewhere else');
      await expect(page.locator('.conflict-side')).toHaveCount(2);
      await expect(page.locator('.conflict-side').nth(1)).toContainText('Their name');
      await expect(page.locator('.conflict-side').nth(1)).toContainText('Changed by you, on another device');
      await expect(page.locator('.modal .hint')).toContainText('1 row is different');
      return { server, p };
    };

    test('Keep mine saves mine on top', async ({ page }) => {
      const { p } = await clash(page);
      await page.click('.modal button:has-text("Keep mine")');
      await expect.poll(() => [p.version, p.data.rows[0].activity]).toEqual([5, 'Mine']);
      await expect(saveState(page)).toHaveText('Saved to your account');
    });

    test('Keep theirs shows theirs', async ({ page }) => {
      const { server, p } = await clash(page);
      await page.click('.modal button:has-text("Keep theirs")');
      await expect.poll(() => page.evaluate(() => state.rows[0].activity)).toBe('Theirs');
      await expect(saveState(page)).toHaveText('Saved to your account');
      expect(p.version).toBe(4);
      expect(server.live()).toHaveLength(1);
    });

    test('Keep both keeps theirs, and saves mine as a copy', async ({ page }) => {
      const { server, p } = await clash(page);
      await page.click('.modal button:has-text("Keep both")');
      await expect.poll(() => server.live().length).toBe(2);
      expect(p.data.rows[0].activity).toBe('Theirs');
      expect((await currentData(server, page)).rows[0].activity).toBe('Mine');
      expect(await page.evaluate(() => [library.current !== 'prog1111', state.rows[0].activity])).toEqual([true, 'Mine']);
    });

    test('closing the box loses nothing, and it asks again at the next change', async ({ page }) => {
      const { p } = await clash(page);
      await page.keyboard.press('Escape');
      await expect(saveState(page)).toHaveText('Saved on this device only');
      expect(p.data.rows[0].activity).toBe('Theirs');
      await page.evaluate(() => localStorage.removeItem('scoutProgramBuilder.base.prog1111'));
      await edit(page, 'Mine again');
      await expect(page.locator('.modal h2')).toHaveText('This program was changed somewhere else');
      await page.click('.modal button:has-text("Keep mine")');
      await expect.poll(() => p.data.rows[0].activity).toBe('Mine again');
    });
  });

  test('the 4th program on a free account explains the limit', async ({ page }) => {
    const server = await open(page, { programs: ['a', 'b', 'c'].map((x) => program(`prog${x}${x}${x}${x}`, EXAMPLE)) });
    await expect(page.locator('#directory .dir-item')).toHaveCount(3);
    await page.click('#btnDirNew');
    await expect(page.locator('.modal h2')).toHaveText('A free account keeps 3 programs');
    await page.click('.modal button:has-text("Not now")');
    // Opening a file doesn't add one: it can only replace the program that's open
    await page.click('#btnImport');
    await page.setInputFiles('#fileJson', exampleFile);
    await expect(page.locator('.modal h2')).toHaveText('Replace your program?');
    await page.click('.modal button:has-text("Cancel")');
    expect(server.live()).toHaveLength(3);
    await page.click('#btnDirNew');
    await expect(page.locator('.modal h2')).toHaveText('A free account keeps 3 programs');
    await page.click('.modal button:has-text("Delete it")');
    // It points at the list on the left, ready to delete one
    await expect(page.locator('.toast', { hasText: 'Delete one with the bin' })).toBeVisible();
    await expect(page.locator('#directory [data-delprog]').first()).toBeFocused();
    expect(server.live()).toHaveLength(3);

    // With one deleted there's room again
    await page.hover('#directory .dir-row:has([data-delprog="progcccc"])');
    await page.click('#directory [data-delprog="progcccc"]');
    await page.click('.modal .btn-danger');
    await expect.poll(() => server.live().length).toBe(2);
    await page.click('#btnDirDup');
    await expect.poll(() => server.live().length).toBe(3);
  });

  test('once paid plans can be bought, the limit offers Premium, and coming back with it lifts the limit', async ({ page, context }) => {
    const server = await open(page, { programs: ['a', 'b', 'c'].map((x) => program(`prog${x}${x}${x}${x}`, EXAMPLE)) });
    server.billing = { available: true, trialAvailable: true };
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await expect.poll(() => server.called('GET /me').length).toBeGreaterThan(1);
    await page.click('#btnDirNew');
    await expect(page.locator('.modal-body')).toContainText('A$4 a month or A$36 a year, with a 14-day free trial');
    await context.route('https://account.qstored.org/**', (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<title>Billing</title>' }));
    const [billing] = await Promise.all([context.waitForEvent('page'), page.click('.modal button:has-text("Try Premium free")')]);
    expect(billing.url()).toBe('https://account.qstored.org/#/billing');
    await billing.close();

    // Premium bought in the other tab: back here, there's no limit
    server.limit = null;
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await expect.poll(() => server.called('GET /me').length).toBeGreaterThan(2);
    await page.click('#btnDirNew');
    await expect(page.locator('.modal h2')).toHaveText('Start a new program');
  });

  test('a program the account has no room for stays on this device, and says so', async ({ page }) => {
    const server = await open(page, { programs: ['a', 'b'].map((x) => program(`prog${x}${x}${x}${x}`, EXAMPLE)) });
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));   // coming back to the page catches up
    await expect.poll(() => server.called('GET /programs?owner=me').length).toBe(2);
    // Another device fills the account, after this one last looked
    server.programs.set('progzzzz', program('progzzzz', EXAMPLE));
    await page.click('#btnDirDup');
    await expect(page.locator('.modal h2')).toHaveText('A free account keeps 3 programs');
    await expect(page.locator('.modal-body')).toContainText('saved on this device only for now');
    await page.click('.modal button:has-text("Not now")');
    await expect(saveState(page)).toHaveText('Saved on this device only');
    expect(server.live()).toHaveLength(3);
  });

  test('Premium has no limit', async ({ page }) => {
    const server = await open(page, { limit: null, programs: ['a', 'b', 'c'].map((x) => program(`prog${x}${x}${x}${x}`, EXAMPLE)) });
    await page.click('#btnDirDup');
    await expect.poll(() => server.live().length).toBe(4);
  });

  test('opening a program fetches it from the account', async ({ page }) => {
    const other = { ...EXAMPLE, branding: { ...EXAMPLE.branding, groupName: 'The other program' } };
    const server = await open(page, {
      programs: [program('prog1111', EXAMPLE), program('prog2222', other, { name: 'Other', updatedAt: '2026-01-01T00:00:00.000Z' })],
    });
    expect(await page.evaluate(() => localStorage.getItem('scoutProgramBuilder.program.prog2222'))).toBeNull();
    await page.click('#directory [data-open="prog2222"]');
    await expect.poll(() => page.evaluate(() => state.branding.groupName)).toBe('The other program');

    // Offline, a program opened before still opens from this device
    server.offline = true;
    await page.click('#directory [data-open="prog1111"]');
    await expect.poll(() => page.evaluate(() => state.branding.groupName)).toBe(EXAMPLE.branding.groupName);
  });

  test('deleting moves the program to the bin, and one restored at the account site comes back', async ({ page }) => {
    const other = program('prog2222', EXAMPLE, { name: 'Other', updatedAt: '2026-01-01T00:00:00.000Z' });
    const server = await open(page, { programs: [program('prog1111', EXAMPLE, { name: 'Cubs Term 3' }), other] });
    await page.hover('#directory .dir-row:has([data-delprog="prog1111"])');
    await page.click('#directory [data-delprog="prog1111"]');
    await expect(page.locator('.modal-body')).toContainText('brought back for 30 days, under Data in your qStored account');
    await page.click('.modal .btn-danger');
    await expect.poll(() => server.programs.get('prog1111').deletedAt).not.toBeNull();
    await expect.poll(() => page.evaluate(() => library.current)).toBe('prog2222');

    await expect(page.locator('#directory .dir-item')).toHaveCount(1);

    // Restored at account.qstored.org (its Data page), it's back here once this page catches up
    server.programs.get('prog1111').deletedAt = null;
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));   // coming back to the page catches up
    await expect(page.locator('#directory .dir-item')).toHaveCount(2);
    await expect(page.locator('#directory [data-open="prog1111"]')).toContainText('Cubs Term 3');
  });

  test('a program deleted on another device goes from the list', async ({ page }) => {
    const server = await open(page, {
      programs: [program('prog1111', EXAMPLE), program('prog2222', EXAMPLE, { name: 'Other', updatedAt: '2026-01-01T00:00:00.000Z' })],
    });
    server.programs.get('prog1111').deletedAt = new Date().toISOString();
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));   // coming back to the page catches up
    await expect(page.locator('#directory .dir-item')).toHaveCount(1);
    await expect.poll(() => page.evaluate(() => library.current)).toBe('prog2222');
  });

  test('Account, under the initials, opens the qStored account site', async ({ page, context }) => {
    await open(page);
    await page.click('#btnAccount');
    await expect(page.locator('#popover')).toContainText('akela@example.com');
    await expect(page.locator('#popover .menu button')).toHaveText(['Account', 'Sign out']);
    await context.route('https://account.qstored.org/**', (route) => route.fulfill({ contentType: 'text/html', body: '<p>account</p>' }));
    const [tab] = await Promise.all([context.waitForEvent('page'), page.click('#pAccount')]);
    await tab.waitForLoadState();
    expect(tab.url()).toBe('https://account.qstored.org/');
    await expect(page.locator('#popover')).toBeHidden();
  });

  test('a name changed at the account site shows in the initial', async ({ page }) => {
    const server = await open(page);
    await expect(page.locator('#btnAccount .avatar')).toHaveText('A');
    server.name = 'Baloo';
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));   // coming back to the page catches up
    await expect(page.locator('#btnAccount .avatar')).toHaveText('B');
  });

  test('Help gives the support address', async ({ page }) => {
    await open(page);
    await page.click('#btnHelp');
    await expect(page.locator('.help-support a[href="mailto:help@example.com"]')).toBeVisible();
  });

  test('Sign out clears this device, leaving none open and a way to start one', async ({ page }) => {
    await open(page);
    await page.click('#btnAccount');
    await page.click('#pSignOut');
    await expect(page.locator('#btnAccount')).toHaveText('Sign in');
    await page.waitForFunction(() => typeof state === 'object' && typeof library === 'object');
    expect(await page.evaluate(() => [library.items.length, library.current, localStorage.getItem('qstored.session'),
      localStorage.getItem('scoutProgramBuilder.program.prog1111')])).toEqual([0, null, null, null]);
    await expect(page.locator('.wizard, .welcome')).toHaveCount(0);
    await expect(page.locator('#emptyState h2')).toHaveText('No program yet');
    await expect(page.locator('#emptyState [data-empty="signin"]')).toBeVisible();
  });

  test('Sign out warns about a program that is not in the account yet', async ({ page }) => {
    const server = await open(page);
    server.offline = true;
    await edit(page, 'Not uploaded');
    await expect(saveState(page)).toContainText('Offline');
    await page.click('#btnAccount');
    await page.click('#pSignOut');
    await expect(page.locator('.modal-body')).toContainText("isn't in your account yet");
    await page.click('.modal button:has-text("Cancel")');
    await expect(page.locator('#btnAccount .avatar')).toBeVisible();
  });

  test('a sign-in that is no longer good asks to sign in again, keeping the program here', async ({ page }) => {
    const server = await open(page);
    server.rejectTokens = true;
    await edit(page, 'Kept');
    await expect(page.locator('.toast.error')).toContainText('sign in again');
    await expect(page.locator('#btnAccount')).toHaveText('Sign in');
    expect(await page.evaluate(() => state.rows[0].activity)).toBe('Kept');
  });

  test('the app switcher lists the internal dashboard for sysadmins only', async ({ page }) => {
    const server = await open(page);
    await page.click('.appbar qs-app-switcher .qs-switch-btn');
    await expect(page.locator('.appbar qs-app-switcher .qs-switch-name')).toHaveText(['Program Builder', 'Pinewood Control', 'Quarters Master']);
    await page.keyboard.press('Escape');

    server.sysadmin = true;
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));   // catches up with the account
    await expect(page.locator('.appbar qs-app-switcher')).toHaveAttribute('sysadmin', '');
    await page.click('.appbar qs-app-switcher .qs-switch-btn');
    await expect(page.locator('.appbar qs-app-switcher .qs-switch-name')).toHaveText(['Program Builder', 'Pinewood Control', 'Quarters Master', 'Internal']);
    await expect(page.locator('.appbar qs-app-switcher .qs-switch-item:has-text("Internal")')).toHaveAttribute('href', 'https://internal.qstored.org/');
  });

  test('the sidebar says programs save to the account', async ({ page }) => {
    await open(page);
    await expect(page.locator('#saveWhere')).toContainText('save to your account');
  });

  test('Help answers the account questions', async ({ page }) => {
    await open(page);
    await page.click('#btnHelp');
    await expect(page.locator('.help-list')).toContainText('Where are my programs saved?');
    await page.click('text=How do I use it on another computer or phone?');
    await expect(page.locator('.help-list details[open] p')).toContainText('Sign in');
  });
});

test.describe("Premium's history and live link", () => {
  const open = async (page, options = {}) => {
    const server = await mockAccount(page, { signedIn: true, programs: [program('prog1111', EXAMPLE, { version: 3 })], ...options });
    errors = await openAccountApp(page, SIGN_IN_LINK);
    await expect(saveState(page)).toHaveText('Saved to your account');
    return server;
  };

  test('History brings back an earlier version, and keeps the one it replaced', async ({ page }) => {
    const server = await open(page, { limit: null });
    await expect(page.locator('#btnHistory')).toBeVisible();
    await edit(page, 'Night hike');
    await expect.poll(() => server.programs.get('prog1111').version).toBe(4);
    await page.click('#btnHistory');
    await expect(page.locator('.modal h2')).toHaveText('Version history');
    await expect(page.locator('#historyList li')).toHaveCount(1);
    await page.click('#historyList button:has-text("Restore")');
    await expect(page.locator('.modal h2')).toHaveText('Restore this version?');
    await page.click('.modal .btn-primary:has-text("Restore")');
    await expect(page.locator('.toast', { hasText: 'Restored' })).toBeVisible();
    expect(server.programs.get('prog1111').data.rows[0].activity).toBe(EXAMPLE.rows[0].activity);
    // The editor shows it, and the night hike is in the history
    await expect(page.locator('#sheet')).not.toContainText('Night hike');
    expect(server.history.get('prog1111').map((v) => v.version)).toEqual([4, 3]);
    await expect(saveState(page)).toHaveText('Saved to your account');
  });

  test('without Premium, History explains it and offers the trial once billing is open', async ({ page, context }) => {
    const server = await mockAccount(page, { signedIn: true, programs: [program('prog1111', EXAMPLE, { version: 3 })] });
    server.billing = { available: true, trialAvailable: true };
    errors = await openAccountApp(page, SIGN_IN_LINK);
    await expect(saveState(page)).toHaveText('Saved to your account');
    await page.click('#btnHistory');
    await expect(page.locator('.modal h2')).toHaveText('Version history is part of Premium');
    await context.route('https://account.qstored.org/**', (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<title>Billing</title>' }));
    const [billing] = await Promise.all([context.waitForEvent('page'), page.click('.modal button:has-text("Try Premium free")')]);
    expect(billing.url()).toBe('https://account.qstored.org/#/billing');
    await billing.close();
  });

  test('the live link is turned on from Export, shows the page and calendar links, and can be changed or turned off', async ({ page, context }) => {
    const server = await open(page, { limit: null });
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.click('#btnExport');
    await page.click('[data-export="live"]');
    await expect(page.locator('.modal h2')).toHaveText('A live link for families');
    await page.click('.modal button:has-text("Turn on the link")');
    await expect(page.locator('.modal h2')).toHaveText('A live link for your Cubs');
    await expect(page.locator('#shareShowing')).toContainText('Showing this program');
    await expect(page.locator('.modal button:has-text("Show this program now")')).toHaveCount(0);
    await expect(page.locator('#shareUrl')).toHaveValue('https://api.qstored.org/p/abcdefghijklmnopqrstuvwx');
    await expect(page.locator('#shareCal')).toHaveValue('webcal://api.qstored.org/p/abcdefghijklmnopqrstuvwx.ics');
    await page.click('[data-copy="shareUrl"]');
    await expect(page.locator('[data-copy="shareUrl"]')).toHaveText('Copied');
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('https://api.qstored.org/p/abcdefghijklmnopqrstuvwx');

    await page.check('#sharePhones');
    await expect(page.locator('.toast', { hasText: 'Phone numbers now show' })).toBeVisible();
    expect(server.links.get('cubs').showPhones).toBe(true);

    await page.click('.modal button:has-text("Make a new link")');
    await expect(page.locator('.modal-body')).toContainText("Families who put this link together with their other children's");
    await page.click('.modal .btn-primary:has-text("Make a new link")');
    await expect(page.locator('#shareUrl')).toHaveValue(/renewed/);
    expect(server.renewals.at(-1)).toEqual({ cutOff: false });
    // Renewing again, this time taking it off families' combined pages too
    await page.click('.modal button:has-text("Make a new link")');
    await page.check('#renewCutOff');
    await page.click('.modal .btn-primary:has-text("Make a new link")');
    await expect(page.locator('#shareUrl')).toHaveValue(/renewedrenewed/);
    expect(server.renewals.at(-1)).toEqual({ cutOff: true });

    await page.click('.modal button:has-text("Turn off")');
    await page.click('.modal .btn-primary:has-text("Turn off")');
    await expect(page.locator('.toast', { hasText: 'The link is off' })).toBeVisible();
    expect(server.links.has('cubs')).toBe(false);
  });

  test("one link for a section's programs: next term's program can be shown on it early", async ({ page }) => {
    const term2 = { ...EXAMPLE, term: { ...EXAMPLE.term, term: 2 } };
    const server = await open(page, { limit: null, programs: [program('prog1111', EXAMPLE, { version: 3 }), program('prog2222', term2, { name: 'Cubs Term 2', term: 2 })] });
    server.links.set('cubs', { slug: 'abcdefghijklmnopqrstuvwx', showPhones: false, pinned: null });
    await page.evaluate(() => openProgram('prog2222'));
    await expect.poll(() => page.evaluate(() => library.current)).toBe('prog2222');
    await page.click('#btnExport');
    await page.click('[data-export="live"]');
    await expect(page.locator('#shareShowing')).toContainText('Showing Cubs Program now');
    await expect(page.locator('#shareShowing')).toContainText('moves on to this program');
    await page.click('.modal button:has-text("Show this program now")');
    await expect(page.locator('.toast', { hasText: 'now shows this program' })).toBeVisible();
    await expect(page.locator('#shareShowing')).toContainText('Showing this program, by your choice');
    expect(server.links.get('cubs').pinned).toBe('prog2222');
  });

  test("families see what's published: changes show a Publish button until they're published", async ({ page }) => {
    const server = await open(page, { limit: null });
    await expect(page.locator('#btnPublish')).toBeHidden();
    // Turning the link on publishes the program as it is
    await page.click('#btnExport');
    await page.click('[data-export="live"]');
    await page.click('.modal button:has-text("Turn on the link")');
    await expect(page.locator('#shareStatus')).toContainText('Families see this program as published');
    expect(server.published.get('prog1111')).toBe(3);
    await page.click('.modal button:has-text("Done")');
    await expect(page.locator('#btnPublish')).toBeHidden();

    // A change: saved to the account, but families don't see it until it's published
    await edit(page, 'Night hike');
    await expect.poll(() => server.programs.get('prog1111').version).toBe(4);
    await expect(page.locator('#btnPublish')).toBeVisible();
    expect(server.published.get('prog1111')).toBe(3);
    await page.click('#btnExport');
    await page.click('[data-export="live"]');
    await expect(page.locator('#shareStatus')).toContainText("You've changed this program since it was published");
    await page.click('.modal button:has-text("Done")');

    await page.click('#btnPublish');
    await expect(page.locator('.toast', { hasText: 'Published. Families see these changes now.' })).toBeVisible();
    expect(server.published.get('prog1111')).toBe(4);
    await expect(page.locator('#btnPublish')).toBeHidden();

    // After a reload, the account's list says what's published
    await page.reload();
    await expect(saveState(page)).toHaveText('Saved to your account');
    await expect(page.locator('#btnPublish')).toBeHidden();
    await edit(page, 'Campfire');
    await expect(page.locator('#btnPublish')).toBeVisible();
  });

  test('a program not published says so, and Publish puts it on the link', async ({ page }) => {
    const term2 = { ...EXAMPLE, term: { ...EXAMPLE.term, term: 2 } };
    const server = await open(page, { limit: null, programs: [program('prog1111', EXAMPLE, { version: 3 }), program('prog2222', term2, { name: 'Cubs Term 2', term: 2 })] });
    server.links.set('cubs', { slug: 'abcdefghijklmnopqrstuvwx', showPhones: false, pinned: null });
    server.published.set('prog1111', 3);
    await page.evaluate(() => openProgram('prog2222'));
    await expect.poll(() => page.evaluate(() => library.current)).toBe('prog2222');
    await page.click('#btnExport');
    await page.click('[data-export="live"]');
    await expect(page.locator('#shareStatus')).toContainText("isn't published, so families can't see it");
    await page.click('.modal .btn-primary:has-text("Publish")');
    await expect(page.locator('#shareStatus')).toContainText('Families see this program as published');
    expect(server.published.get('prog2222')).toBe(1);
  });

  test('without Premium, the live link explains it', async ({ page }) => {
    await open(page);
    await page.click('#btnExport');
    await page.click('[data-export="live"]');
    await expect(page.locator('.modal h2')).toHaveText('A live link for families is part of Premium');
    await expect(page.locator('.modal-body')).toContainText('Paid plans are on their way');
  });

  test('signed out, History is hidden and the live link asks to sign in', async ({ page }) => {
    await mockAccount(page);
    errors = await openAccountApp(page);
    await expect(page.locator('#btnHistory')).toBeHidden();
    await page.click('#btnExport');
    await page.click('[data-export="live"]');
    await expect(page.locator('.modal h2')).toHaveText('Sign in first');
  });
});
