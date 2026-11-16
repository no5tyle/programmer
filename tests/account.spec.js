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
  await page.click('#btnPrograms');
  await expect(page.locator('#popover .pop-sub')).toHaveText('saved in this browser');
  await expect(page.locator('#pSignIn')).toHaveCount(0);
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
    await page.click('#btnPrograms');
    await expect(page.locator('#popover .prog-item')).toHaveCount(1);
    await expect(page.locator('#popover .prog-signin')).toContainText('Sign in to keep more than one');
    await page.click('#pSignIn');
    await expect(page.locator('.modal h2')).toHaveText('Sign in');
  });

  test('keeps one program: New, Duplicate and Open ask to sign in or replace it', async ({ page }) => {
    await edit(page, 'Night hike');
    const first = await page.evaluate(() => library.current);

    await page.click('#btnPrograms');
    await page.click('#pDupProg');
    await expect(page.locator('.modal h2')).toHaveText('Sign in to keep more than one');
    await page.click('.modal button:has-text("Cancel")');
    expect(await page.evaluate(() => library.items.length)).toBe(1);

    // New program: replace it, then choose the term as usual
    await page.click('#btnPrograms');
    await page.click('#pNewProg');
    await page.click('.modal button:has-text("Replace it")');
    await expect(page.locator('.modal-body')).toContainText("takes this one's place");
    await page.click('.modal [data-i="1"]');
    expect(await page.evaluate(() => [library.items.length, state.rows[0].activity])).toEqual([1, '']);
    expect(await page.evaluate(() => library.current)).not.toBe(first);
    expect(await page.evaluate((id) => localStorage.getItem(`scoutProgramBuilder.program.${id}`), first)).toBeNull();

    // Opening a file asks too, and Save file is offered first
    await page.click('#btnImport');
    await page.setInputFiles('#fileJson', exampleFile);
    await expect(page.locator('.modal h2')).toHaveText('Sign in to keep more than one');
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

    await page.click('#btnPrograms');
    await expect(page.locator('#popover .prog-open span')).toContainText('on this device only');
    await page.click('#popover [data-addprog]');
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
    await page.click('#btnPrograms');
    await expect(page.locator('#popover .pop-title')).toContainText('My programs');
    await expect(page.locator('#popover .prog-item')).toHaveCount(2);
  });

  test('a used link says so, and stays signed out', async ({ page }) => {
    await mockAccount(page);
    await page.addInitScript(() => localStorage.setItem('qstored.pendingEmail', 'akela@example.com'));
    errors = await openAccountApp(page, '/?mode=signIn&oobCode=used-code');
    await expect(page.locator('.toast.error')).toContainText('has been used or has run out');
    await expect(page.locator('#btnAccount')).toHaveText('Sign in');
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

    // Opening the Programs list, or reopening the page, sends nothing more
    const puts = server.called('PUT').length;
    await page.click('#btnPrograms');
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

  test.describe('when the same program was changed in two places', () => {
    const clash = async (page) => {
      const server = await open(page);
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
      await edit(page, 'Mine again');
      await expect(page.locator('.modal h2')).toHaveText('This program was changed somewhere else');
      await page.click('.modal button:has-text("Keep mine")');
      await expect.poll(() => p.data.rows[0].activity).toBe('Mine again');
    });
  });

  test('the 4th program on a free account explains the limit', async ({ page }) => {
    const server = await open(page, { programs: ['a', 'b', 'c'].map((x) => program(`prog${x}${x}${x}${x}`, EXAMPLE)) });
    await page.click('#btnPrograms');
    await expect(page.locator('#popover .prog-item')).toHaveCount(3);
    await page.click('#pNewProg');
    await expect(page.locator('.modal h2')).toHaveText('A free account keeps 3 programs');
    await page.click('.modal button:has-text("Not now")');
    await page.click('#btnImport');
    await page.setInputFiles('#fileJson', exampleFile);
    await expect(page.locator('.modal h2')).toHaveText('A free account keeps 3 programs');
    await page.click('.modal button:has-text("Delete an old program")');
    await expect(page.locator('#popover .prog-item')).toHaveCount(3);
    expect(server.live()).toHaveLength(3);

    // With one deleted there's room again
    await page.click('#popover [data-delprog="progcccc"]');
    await page.click('.modal .btn-danger');
    await expect.poll(() => server.live().length).toBe(2);
    await page.click('#btnPrograms');
    await page.click('#pDupProg');
    await expect.poll(() => server.live().length).toBe(3);
  });

  test('a program the account has no room for stays on this device, and says so', async ({ page }) => {
    const server = await open(page, { programs: ['a', 'b'].map((x) => program(`prog${x}${x}${x}${x}`, EXAMPLE)) });
    await page.click('#btnPrograms');
    await expect.poll(() => server.called('GET /programs?owner=me').length).toBe(2);
    // Another device fills the account, after this one last looked
    server.programs.set('progzzzz', program('progzzzz', EXAMPLE));
    await page.click('#pDupProg');
    await expect(page.locator('.modal h2')).toHaveText('A free account keeps 3 programs');
    await expect(page.locator('.modal-body')).toContainText('saved on this device only for now');
    await page.click('.modal button:has-text("Not now")');
    await expect(saveState(page)).toHaveText('Saved on this device only');
    expect(server.live()).toHaveLength(3);
  });

  test('Premium has no limit', async ({ page }) => {
    const server = await open(page, { limit: null, programs: ['a', 'b', 'c'].map((x) => program(`prog${x}${x}${x}${x}`, EXAMPLE)) });
    await page.click('#btnPrograms');
    await page.click('#pDupProg');
    await expect.poll(() => server.live().length).toBe(4);
  });

  test('opening a program fetches it from the account', async ({ page }) => {
    const other = { ...EXAMPLE, branding: { ...EXAMPLE.branding, groupName: 'The other program' } };
    const server = await open(page, {
      programs: [program('prog1111', EXAMPLE), program('prog2222', other, { name: 'Other', updatedAt: '2026-01-01T00:00:00.000Z' })],
    });
    expect(await page.evaluate(() => localStorage.getItem('scoutProgramBuilder.program.prog2222'))).toBeNull();
    await page.click('#btnPrograms');
    await page.click('#popover [data-open="prog2222"]');
    await expect.poll(() => page.evaluate(() => state.branding.groupName)).toBe('The other program');

    // Offline, a program opened before still opens from this device
    server.offline = true;
    await page.click('#btnPrograms');
    await page.click('#popover [data-open="prog1111"]');
    await expect.poll(() => page.evaluate(() => state.branding.groupName)).toBe(EXAMPLE.branding.groupName);
  });

  test('deleting moves the program to the bin, and Account brings it back', async ({ page }) => {
    const other = program('prog2222', EXAMPLE, { name: 'Other', updatedAt: '2026-01-01T00:00:00.000Z' });
    const server = await open(page, { programs: [program('prog1111', EXAMPLE, { name: 'Cubs Term 3' }), other] });
    await page.click('#btnPrograms');
    await page.click('#popover [data-delprog="prog1111"]');
    await expect(page.locator('.modal-body')).toContainText('brought back for 30 days');
    await page.click('.modal .btn-danger');
    await expect.poll(() => server.programs.get('prog1111').deletedAt).not.toBeNull();
    await expect.poll(() => page.evaluate(() => library.current)).toBe('prog2222');

    await page.click('#btnAccount');
    await page.click('#pAccount');
    await expect(page.locator('#acPlan')).toHaveText('Free account · 1 of 3 programs');
    await expect(page.locator('.account-bin-item')).toContainText('Cubs Term 3');
    await page.click('[data-restore="prog1111"]');
    await expect(page.locator('#acPlan')).toHaveText('Free account · 2 of 3 programs');
    await page.click('.modal-actions .btn');
    await page.click('#btnPrograms');
    await expect(page.locator('#popover .prog-item')).toHaveCount(2);
  });

  test('a program deleted on another device goes from the list', async ({ page }) => {
    const server = await open(page, {
      programs: [program('prog1111', EXAMPLE), program('prog2222', EXAMPLE, { name: 'Other', updatedAt: '2026-01-01T00:00:00.000Z' })],
    });
    server.programs.get('prog1111').deletedAt = new Date().toISOString();
    await page.click('#btnPrograms');
    await expect(page.locator('#popover .prog-item')).toHaveCount(1);
    await expect.poll(() => page.evaluate(() => library.current)).toBe('prog2222');
  });

  test('the Account page: name, download, support address', async ({ page }) => {
    const server = await open(page);
    await page.click('#btnAccount');
    await expect(page.locator('#popover')).toContainText('akela@example.com');
    await page.click('#pAccount');
    await expect(page.locator('.account-page')).toContainText('Signed in as akela@example.com');
    await expect(page.locator('.account-page a[href="mailto:help@example.com"]')).toBeVisible();
    await page.fill('#acName', 'Baloo');
    await page.click('#acSaveName');
    await expect(page.locator('.toast', { hasText: 'Name saved' })).toBeVisible();
    expect(server.name).toBe('Baloo');
    await expect(page.locator('#btnAccount .avatar')).toHaveText('B');

    const [download] = await Promise.all([page.waitForEvent('download'), page.click('#acExport')]);
    expect(download.suggestedFilename()).toBe('qstored-programs.zip');
  });

  test('Sign out clears this device and starts again with one program', async ({ page }) => {
    await open(page);
    await page.click('#btnAccount');
    await page.click('#pSignOut');
    await expect(page.locator('#btnAccount')).toHaveText('Sign in');
    await page.waitForFunction(() => typeof state === 'object' && typeof library === 'object');
    expect(await page.evaluate(() => [library.items.length, state.branding.groupName, localStorage.getItem('qstored.session'),
      localStorage.getItem('scoutProgramBuilder.program.prog1111')])).toEqual([1, '', null, null]);
    await expect(page.locator('.wizard, .welcome')).toHaveCount(0);
    await expect(saveState(page)).toHaveText('Saved on this device');
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

  test('Delete my account removes it, and signs out', async ({ page }) => {
    const server = await open(page);
    await page.click('#btnAccount');
    await page.click('#pAccount');
    await page.click('#acDelete');
    await expect(page.locator('.modal h2')).toHaveText('Delete your account?');
    await page.click('.modal .btn-danger');
    await expect(page.locator('#btnAccount')).toHaveText('Sign in');
    expect(server.deleted).toBe(true);
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
    await page.click('.appbar .qs-switch-btn');
    await expect(page.locator('.appbar .qs-switch-name')).toHaveText(['Program Builder', 'Your qstored account']);
    await page.keyboard.press('Escape');

    server.sysadmin = true;
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));   // catches up with the account
    await expect(page.locator('.appbar qs-app-switcher')).toHaveAttribute('sysadmin', '');
    await page.click('.appbar .qs-switch-btn');
    await expect(page.locator('.appbar .qs-switch-name')).toHaveText(['Program Builder', 'Internal', 'Your qstored account']);
    await expect(page.locator('.appbar .qs-switch-item:has-text("Internal")')).toHaveAttribute('href', 'https://internal.qstored.org/');
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
