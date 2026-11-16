/*
 * Accounts: signing in by email link, and saving programs to the account through the API
 * (docs/premium-plan.md, sections 3 and 4).
 *
 * The browser's copy stays the working copy. For a signed-in leader it is a cache of the account:
 * each save is sent on to the API in the background, saves made offline wait until the connection
 * is back, and nothing is overwritten without asking when two devices change the same program.
 *
 * Accounts are on only when js/config.js names the API and the Firebase project. Without them the
 * builder works as it always has, with every program kept in this browser.
 *
 * This file only defines things; js/app.js calls accountInit() once the program has loaded.
 */
'use strict';

const ACCOUNT = Object.assign({
  apiBase: '', firebaseApiKey: '', authEmulatorHost: '', supportEmail: '', privacyUrl: '', termsUrl: '',
  syncGap: 3000,      // send a save to the API at most this often (ms)
  retryGap: 15000,    // while offline, try again this often (ms)
}, window.QSTORED_CONFIG);

const SESSION_KEY = 'qstored.session';              // { uid, email, idToken, refreshToken, expiresAt }
const PENDING_EMAIL_KEY = 'qstored.pendingEmail';   // the address a sign-in link was sent to, from this browser
const ME_KEY = 'qstored.me';                        // the last GET /me, for limits while offline

/*
 * A signed-in leader's library items carry a few extra fields:
 *   version   the account's version this copy is based on (absent: not in the account yet)
 *   dirty     changed here since it was last sent
 *   cached    false: listed from the account, but not opened on this device yet
 *   stale     the account has a newer version than the copy here
 *   hold      kept on this device only for now: 'asked' (the leader chose not to add it), 'limit'
 *             (the account is full), 'conflict' (changed elsewhere, not yet chosen), 'error'
 * and the library itself: owner (whose account the cache is of) and deleted (ids to delete there).
 */

const stored = (key) => { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } };
let session = stored(SESSION_KEY);   // read now, so the page's first save already knows who's signed in
let me = stored(ME_KEY);
let offline = false;
let syncing = false;
let syncAgain = false;
let syncTimer = null;
let lastSync = 0;
let refreshing = null;   // one token refresh at a time
let settingUp = false;   // just signed in: nothing is sent until the leader has said what to add

const accountsOn = () => !!(ACCOUNT.apiBase && ACCOUNT.firebaseApiKey);
const signedIn = () => !!session;
const libItem = (id) => library.items.find((x) => x.id === id);
const onPhone = () => document.body.classList.contains('mobile');

function saveLibrary() {
  try { localStorage.setItem(LIB_KEY, JSON.stringify(library)); } catch { /* the next save reports it */ }
  renderDirectory();
}

const offlineError = () => Object.assign(new Error('offline'), { offline: true });
const authError = () => Object.assign(new Error('signed out'), { auth: true });

/* ---------------------------------------------------------------- Firebase sign-in (its REST API; no script to load) */

function firebaseUrl(service, path) {
  const base = ACCOUNT.authEmulatorHost ? `http://${ACCOUNT.authEmulatorHost}/${service}` : `https://${service}`;
  return `${base}${path}?key=${encodeURIComponent(ACCOUNT.firebaseApiKey)}`;
}

async function firebaseCall(service, path, body, form = false) {
  let res;
  try {
    res = await fetch(firebaseUrl(service, path), {
      method: 'POST',
      headers: { 'Content-Type': form ? 'application/x-www-form-urlencoded' : 'application/json' },
      body: form ? new URLSearchParams(body).toString() : JSON.stringify(body),
    });
  } catch { throw offlineError(); }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status >= 500) throw offlineError();
    throw Object.assign(new Error(json.error?.message || 'Sign-in failed'), { code: String(json.error?.message || '') });
  }
  return json;
}

/** Emails the sign-in link. It comes back to this page with the code in its address. */
function sendSignInLink(email) {
  return firebaseCall('identitytoolkit.googleapis.com', '/v1/accounts:sendOobCode', {
    requestType: 'EMAIL_SIGNIN', email, continueUrl: location.origin + location.pathname, canHandleCodeInApp: true,
  });
}

async function signInWithLink(email, oobCode) {
  const r = await firebaseCall('identitytoolkit.googleapis.com', '/v1/accounts:signInWithEmailLink', { email, oobCode });
  setSession({
    uid: r.localId, email: r.email || email, idToken: r.idToken, refreshToken: r.refreshToken,
    expiresAt: Date.now() + (+r.expiresIn || 3600) * 1000,
  });
}

function setSession(next) {
  session = next;
  try {
    if (next) localStorage.setItem(SESSION_KEY, JSON.stringify(next));
    else localStorage.removeItem(SESSION_KEY);
  } catch { /* signed in for this visit only */ }
}

/** A token the API will accept, renewed when it's about to run out. */
async function idToken(force = false) {
  if (!session) throw authError();
  if (!force && session.expiresAt - Date.now() > 60000) return session.idToken;
  refreshing ||= (async () => {
    try {
      const r = await firebaseCall('securetoken.googleapis.com', '/v1/token',
        { grant_type: 'refresh_token', refresh_token: session.refreshToken }, true);
      setSession({ ...session, idToken: r.id_token, refreshToken: r.refresh_token, expiresAt: Date.now() + (+r.expires_in || 3600) * 1000 });
    } catch (err) {
      if (err.offline) throw err;
      sessionEnded();
      throw authError();
    } finally { refreshing = null; }
  })();
  await refreshing;
  return session.idToken;
}

/** The sign-in is no longer good (signed out elsewhere, or the account was deleted). The programs here stay. */
function sessionEnded() {
  if (!session) return;
  setSession(null);
  renderAccountButton(); refreshSaveState();
  toast('Please sign in again to keep saving to your account.', 'error');
}

/* ---------------------------------------------------------------- the API */

/** Calls the API. Answers { status, ok, json, res }; throws an `offline` error when it can't be reached. */
async function api(method, path, { body, headers = {}, keepalive = false } = {}) {
  for (let attempt = 0; ; attempt++) {
    const token = await idToken(attempt > 0);
    let res;
    try {
      res = await fetch(`${ACCOUNT.apiBase.replace(/\/$/, '')}/api/v1${path}`, {
        method, keepalive,
        headers: { Authorization: `Bearer ${token}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch { throw offlineError(); }
    if (res.status === 401 && attempt === 0) continue;
    if (res.status === 401) { sessionEnded(); throw authError(); }
    if (res.status >= 500) throw offlineError();
    const json = (res.headers.get('Content-Type') || '').includes('json') ? await res.json().catch(() => null) : null;
    return { status: res.status, ok: res.ok, json, res };
  }
}

const errorCode = (r) => r.json?.error?.code || '';
const errorText = (r) => r.json?.error?.message || 'Something went wrong. Please try again.';

async function loadMe() {
  const r = await api('GET', '/me');
  if (!r.ok) return me;
  me = r.json;
  try { localStorage.setItem(ME_KEY, JSON.stringify(me)); } catch { /* not needed to carry on */ }
  renderAccountButton();
  return me;
}

/* ---------------------------------------------------------------- the save message */

const needsUpload = (x) => !x.hold && x.cached !== false && (x.dirty || x.version == null);
const pendingWork = () => signedIn() && (library.items.some(needsUpload) || (library.deleted || []).length > 0);

/** What the message by Undo says once a change is saved here: where it's saved. Null leaves it as it was. */
function saveStateInfo() {
  if (!accountsOn()) return null;
  const device = 'Your program is saved in this browser. Sign in to save it to your account and use it on any device.';
  if (!signedIn()) return { state: 'saved', text: 'Saved on this device', title: device };
  const cur = libItem(library.current);
  if (cur?.hold) {
    return { state: 'local', text: 'Saved on this device only', title: 'This program isn\'t in your account. Add it from your list of programs.' };
  }
  if (cur && needsUpload(cur)) {
    if (offline) {
      return { state: 'local', text: 'Offline: saved on this device, will upload when you\'re back online', title: '' };
    }
    return { state: 'saving', text: 'Saving…', title: '' };
  }
  return { state: 'saved', text: 'Saved to your account', title: 'Your programs save to your account automatically. Sign in on another device to use them there.' };
}

function refreshSaveState() {
  const el = $('#saveState');
  if (el && accountsOn() && el.dataset.state !== 'failed') setSaveState('saved');
}

/* ---------------------------------------------------------------- sending saves */

/** Called by save() when the program's contents changed. */
function accountChanged(item) {
  if (!signedIn()) return;
  item.dirty = true;
  if (item.hold === 'conflict' || item.hold === 'error') delete item.hold;   // try again, now it has changed
}

/** Called by save() after the library is written: send the change on, but not too often. */
function syncSoon(wait) {
  if (!signedIn() || syncTimer || settingUp) return;
  const gap = wait ?? Math.max(0, lastSync + ACCOUNT.syncGap - Date.now());
  syncTimer = setTimeout(() => { syncTimer = null; runSync(); }, gap);
}

async function runSync() {
  if (syncing) { syncAgain = true; return; }
  if (!signedIn() || settingUp) return;
  syncing = true;
  let countChanged = false;
  try {
    for (const id of [...(library.deleted || [])]) {
      await api('DELETE', `/programs/${id}`);   // already gone is as good as deleted
      library.deleted = library.deleted.filter((x) => x !== id);
      saveLibrary();
      countChanged = true;
    }
    for (const id of library.items.filter(needsUpload).map((x) => x.id)) {
      if (await pushProgram(id)) countChanged = true;
    }
    offline = false;
    if (countChanged) await loadMe();
  } catch (err) {
    if (err.offline) offline = true;
    else if (!err.auth) console.warn(err);
  } finally {
    syncing = false;
    lastSync = Date.now();
    refreshSaveState();
    if (signedIn() && (syncAgain || pendingWork())) { syncAgain = false; syncSoon(offline ? ACCOUNT.retryGap : undefined); }
  }
}

/** Sends one program. True if it was added to the account (so the count changed). */
async function pushProgram(id) {
  const key = programKey(id);
  const json = localStorage.getItem(key);
  let item = libItem(id);
  if (!item) return false;
  if (!json) { item.cached = false; delete item.dirty; saveLibrary(); return false; }
  const fresh = item.version == null;
  const body = { name: item.name, data: JSON.parse(json) };
  const r = fresh
    ? await api('POST', '/programs', { body: { id, owner: 'me', ...body } })
    : await api('PUT', `/programs/${id}`, { body, headers: { 'If-Match': `"${item.version}"` } });
  item = libItem(id);
  if (!item) return false;   // deleted here while it was being sent
  const code = errorCode(r);

  if (r.ok) {
    item.version = r.json.version;
    if (localStorage.getItem(key) === json) delete item.dirty;   // still dirty if it changed while sending
    saveLibrary();
    return fresh;
  }
  if (code === 'version_conflict') { await resolveConflict(id, json, r.json.program); return false; }
  if (code === 'program_exists') {
    // It reached the account before (a save sent as the page closed, say). Compare with what's there.
    const got = await api('GET', `/programs/${id}`);
    if (got.ok) { await resolveConflict(id, json, got.json); return false; }
    item.version = 0;   // in the bin: the next pass restores it
  } else if (code === 'program_deleted') {
    // Deleted on another device, but changed here since: nothing is lost silently, so it comes back.
    const back = await api('POST', `/programs/${id}/restore`);
    if (back.ok) item.version = back.json.version;
    else if (errorCode(back) === 'program_limit') holdForLimit(item);
    else item.version = null;
  } else if (code === 'not_found') {
    delete item.version;   // gone from the account for good: add it again
  } else if (code === 'id_taken') {
    renameProgram(item);
  } else if (code === 'program_limit') {
    holdForLimit(item);
  } else {
    item.hold = 'error';
    toast(`This program couldn't be saved to your account. ${errorText(r)}`, 'error');
  }
  saveLibrary();
  return false;
}

function holdForLimit(item) {
  item.hold = 'limit';
  saveLibrary();
  showLimitBox(`<p><strong>${esc(item.name)}</strong> is saved on this device only for now.</p>`);
}

/** Gives a program a new id, when its own turns out to be someone else's. */
function renameProgram(item) {
  const id = uid();
  try {
    localStorage.setItem(programKey(id), localStorage.getItem(programKey(item.id)));
    localStorage.removeItem(programKey(item.id));
  } catch { return; }
  if (library.current === item.id) library.current = id;
  item.id = id;
  delete item.version;
}

/* ---------------------------------------------------------------- when two devices change the same program */

const sameData = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function rowsDiffering(mine, theirs) {
  const a = new Map((mine.rows || []).map((r) => [r.id, r]));
  const b = new Map((theirs.rows || []).map((r) => [r.id, r]));
  let n = 0;
  for (const [id, r] of a) if (!b.has(id) || !sameData(r, b.get(id))) n++;
  for (const id of b.keys()) if (!a.has(id)) n++;
  return n;
}

const activityCount = (data) => (data.rows || []).filter((r) => !r.noMeeting && (r.activity || r.description)).length;

/** Puts the account's copy of a program on this device, and on screen if it's the one that's open. */
function storeRemote(p) {
  let item = libItem(p.id);
  if (!item) { item = { id: p.id }; library.items.push(item); }
  // Kept in the builder's current shape, so that opening an older program doesn't count as changing it
  const data = normalise(p.data);
  localStorage.setItem(programKey(p.id), JSON.stringify(data));
  Object.assign(item, {
    name: p.name, group: p.groupName || '', updated: Date.parse(p.updatedAt) || Date.now(), version: p.version,
    section: data.branding.section, sectionName: data.branding.sectionName, year: data.term.year, term: data.term.term,
  });
  delete item.dirty; delete item.cached; delete item.stale; delete item.hold;
  saveLibrary();
  if (p.id === library.current) {
    state = data;
    undoStack = []; $('#btnUndo').disabled = true;
    renderAll();
  }
}

/**
 * A save was refused because the account has a newer version. Shows both, and the leader picks:
 * keep mine, keep theirs, or keep both (theirs stays; mine becomes a copy).
 */
async function resolveConflict(id, mineJson, theirs) {
  const item = libItem(id);
  if (!item) return;
  const mine = JSON.parse(mineJson);
  if (sameData(mine, theirs.data) || sameData(mine, normalise(theirs.data))) {   // the same change, already there
    item.version = theirs.version;
    if (localStorage.getItem(programKey(id)) === mineJson) delete item.dirty;
    saveLibrary();
    return;
  }
  const differ = rowsDiffering(mine, normalise(theirs.data));   // both in the builder's current shape
  const who = theirs.updatedBy?.id === session?.uid ? 'you, on another device' : (theirs.updatedBy?.name || 'another leader');
  const side = (title, name, when, data) => `
    <div class="conflict-side"><h3>${title}</h3><b>${esc(name)}</b><span>${esc(when)}</span>
      <span>${activityCount(data)} activit${activityCount(data) === 1 ? 'y' : 'ies'}</span></div>`;
  const choice = await modal({
    title: 'This program was changed somewhere else',
    body: `<p>It was saved to your account from another device while you were changing it here. Nothing has been lost. Which do you want to keep?</p>
      <div class="conflict">
        ${side('Mine', item.name, `Changed on this device, ${relTime(item.updated)}`, mine)}
        ${side('Theirs', theirs.name, `Changed by ${who}, ${relTime(Date.parse(theirs.updatedAt))}`, theirs.data)}
      </div>
      <p class="hint">${differ ? `${differ} row${differ === 1 ? ' is' : 's are'} different.` : 'The rows are the same; the settings or styling differ.'} <b>Keep both</b> keeps theirs, and saves mine as a copy.</p>`,
    buttons: [{ label: 'Keep theirs', value: 'theirs', cls: 'btn-outline' }, { label: 'Keep both', value: 'both', cls: 'btn-outline' },
      { label: 'Keep mine', value: 'mine', cls: 'btn-primary' }],
  });
  const now = libItem(id);
  if (!now) return;
  if (choice === 'mine') {
    now.version = theirs.version;   // the next pass saves mine on top of theirs
    now.dirty = true;
  } else if (choice === 'theirs') {
    storeRemote(theirs);
    toast('Now showing the other version.');
  } else if (choice === 'both') {
    const wasOpen = library.current === id;
    const copy = copyOf(JSON.parse(localStorage.getItem(programKey(id)) || mineJson));
    const copyId = uid();
    localStorage.setItem(programKey(copyId), JSON.stringify(copy));
    library.items.push({ id: copyId, name: `${now.name} (my copy)`, group: now.group, updated: Date.now(), dirty: true });
    if (wasOpen) library.current = copyId;   // carry on in my own version
    storeRemote(theirs);
    if (wasOpen) { state = normalise(copy); undoStack = []; $('#btnUndo').disabled = true; renderAll(); }
    toast('Both kept. Yours is saved as a copy.');
  } else {
    now.hold = 'conflict';   // asked again at the next change
  }
  saveLibrary();
}

/* ---------------------------------------------------------------- the account's programs */

/** Brings the list of programs in step with the account. Programs waiting to upload are left alone. */
async function refreshPrograms() {
  const r = await api('GET', '/programs?owner=me');
  if (!r.ok) return;
  const gone = new Set(library.deleted || []);
  const remote = new Map(r.json.programs.filter((p) => !gone.has(p.id)).map((p) => [p.id, p]));
  library.items = library.items.filter((x) => {
    if (x.version == null || x.dirty || x.hold || remote.has(x.id)) return true;
    try { localStorage.removeItem(programKey(x.id)); } catch { /* ignore */ }   // deleted on another device
    return false;
  });
  for (const p of remote.values()) {
    const item = libItem(p.id);
    const summary = {
      name: p.name, group: p.groupName || '', updated: Date.parse(p.updatedAt) || Date.now(),
      section: p.section ?? null, year: p.year, term: p.term,
    };
    if (!item) library.items.push({ id: p.id, ...summary, version: p.version, cached: false });
    else if (item.version == null) item.version = 0;   // it's there after all: the next save compares the two
    else if (!item.dirty && p.version > item.version) Object.assign(item, summary, { stale: true });
    else if (!item.dirty && item.cached === false) Object.assign(item, summary, { version: p.version });
  }
  saveLibrary();
  await ensureCurrent();
}

/** True when the open program has changes that haven't reached storage yet (typed in the last moment). */
const unsavedHere = () => localStorage.getItem(programKey(library.current)) !== JSON.stringify(state);

/** Before a program is opened: take the account's copy if it's newer. False if it can't be opened. */
async function fetchForOpen(id) {
  const item = libItem(id);
  if (!item || !signedIn() || item.dirty || item.version == null || item.hold) return !!item;
  try {
    const r = await api('GET', `/programs/${id}`);
    if (r.ok) {
      if (item.cached === false || item.stale || r.json.version !== item.version) storeRemote(r.json);
      return true;
    }
    library.items = library.items.filter((x) => x.id !== id);
    try { localStorage.removeItem(programKey(id)); } catch { /* ignore */ }
    saveLibrary();
    toast('That program was deleted on another device.');
    return false;
  } catch (err) {
    if (item.cached !== false && readJSON(programKey(id))) return true;   // offline: use the copy here
    if (!err.auth) toast('You\'re offline, and that program isn\'t on this device yet.', 'error');
    return false;
  }
}

/** If the open program has gone (deleted elsewhere, or left out at sign-in), open the newest, or start one. */
async function ensureCurrent() {
  if (libItem(library.current)) return;
  for (const x of [...library.items].sort((a, b) => b.updated - a.updated)) {
    if (!(await fetchForOpen(x.id))) continue;
    library.current = x.id;
    state = normalise(readJSON(programKey(x.id)));
    undoStack = []; $('#btnUndo').disabled = true;
    save(); renderAll();
    return;
  }
  library.current = uid();
  freshState();
  undoStack = []; $('#btnUndo').disabled = true;
  save(); renderAll();
}

/** Takes the newer copy of the open program, unless there are changes here. */
async function checkCurrent() {
  const item = libItem(library.current);
  if (!item || item.dirty || item.version == null || item.hold || unsavedHere()) return;
  const r = await api('GET', `/programs/${item.id}`);
  const now = libItem(item.id);
  if (!r.ok || !now || now.dirty || library.current !== item.id || unsavedHere()) return;
  if (r.json.version !== now.version) { storeRemote(r.json); toast('Updated with the changes from your other device.'); }
}

/** Catch up with the account: on arriving, on coming back to the page, and when the connection returns. */
async function catchUp() {
  if (!signedIn()) return;
  try {
    await loadMe();
    await refreshPrograms();
    await checkCurrent();
    offline = false;
  } catch (err) {
    if (err.offline) offline = true;
  }
  refreshSaveState();
  if (pendingWork()) syncSoon(0);
}

/** Called when a program is deleted here: it goes to the account's bin too. */
function accountDeleted(item) {
  if (!signedIn() || item.version == null) return;
  library.deleted = [...(library.deleted || []), item.id];
  saveLibrary();
  syncSoon(0);
}

/* ---------------------------------------------------------------- one program without an account, three with a free one */

const isBlankProgram = (data) => !data?.branding?.groupName?.trim()
  && !(data?.rows || []).some((r) => !r.autoHoliday && (r.activity || r.description || r.notes));

function atLimit() {
  const limit = me?.programs?.limit;
  return limit != null && library.items.filter((x) => !x.hold).length >= limit;
}

function showLimitBox(extra = '') {
  const limit = me?.programs?.limit ?? 3;
  return modal({
    title: `A free account keeps ${limit} programs`,
    body: `${extra}<p>Your account has ${limit} programs already. To keep another, delete one you no longer need. Deleted programs can be brought back for 30 days, from <strong>Account</strong>.</p>
      <p class="hint">Premium, with as many programs as you like, is on its way.</p>`,
    buttons: [{ label: 'Not now', value: null, cls: 'btn-text' }, { label: 'Delete an old program', value: 'delete', cls: 'btn-primary' }],
  }).then((choice) => { if (choice === 'delete') showDirectoryToDelete(); });
}

/**
 * Asked before another program is started (New, Duplicate, opening a file).
 * Answers 'add', 'replace' (signed out: the one program on this device is replaced) or null.
 */
async function newProgramGate() {
  if (!accountsOn()) return 'add';
  if (signedIn()) {
    if (!atLimit()) return 'add';
    await showLimitBox();
    return null;
  }
  for (;;) {
    const choice = await modal({
      title: 'Sign in to keep more than one',
      body: `<p>Without an account, the builder keeps one program on this device. <strong>Sign in</strong> (it's free) to keep up to 3, and use them on any device.</p>
        <p>Or replace the program on this device. Use <strong>Save file</strong> first to keep a copy of it.</p>`,
      buttons: [{ label: 'Cancel', value: null, cls: 'btn-text' }, { label: 'Save file', value: 'file', cls: 'btn-outline' },
        { label: 'Replace it', value: 'replace', cls: 'btn-outline' }, { label: 'Sign in', value: 'signin', cls: 'btn-primary' }],
    });
    if (choice === 'file') { await saveProgramAs(); continue; }
    if (choice === 'signin') openSignIn();
    return choice === 'replace' ? 'replace' : null;
  }
}

/** Adds a program that was being kept on this device only to the account. */
async function addHeldToAccount(id) {
  const item = libItem(id);
  if (!item) return;
  delete item.hold;
  item.dirty = true;
  saveLibrary();
  refreshSaveState();
  await runSync();
  if (!libItem(id)?.hold && !offline) toast('Added to your account.');
}

/* ---------------------------------------------------------------- signing in and out */

const validEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

function policyLinks() {
  const links = [ACCOUNT.privacyUrl && `<a href="${esc(ACCOUNT.privacyUrl)}" target="_blank" rel="noopener">Privacy</a>`,
    ACCOUNT.termsUrl && `<a href="${esc(ACCOUNT.termsUrl)}" target="_blank" rel="noopener">Terms of use</a>`].filter(Boolean);
  return links.length ? `<p class="hint">${links.join(' · ')}</p>` : '';
}

/** A box with one field. Answers what was typed, or null. Enter presses the main button. */
function askFor({ title, body, label, type = 'text', value = '', button }) {
  const done = modal({
    title,
    body: `${body}<label class="field"><span>${esc(label)}</span><input type="${type}" id="askInput" value="${esc(value)}" autocomplete="${type === 'email' ? 'email' : 'off'}"></label>`,
    buttons: [{ label: 'Cancel', value: null, cls: 'btn-text' }, { label: button, value: 'ok', cls: 'btn-primary' }],
  });
  const input = $('#askInput');
  input.focus(); input.select();
  input.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); $('#modal .btn-primary').click(); } };
  return done.then((choice) => (choice === 'ok' ? input.value.trim() : null));
}

async function openSignIn() {
  closePopover();
  let email = '';
  for (;;) {
    email = await askFor({
      title: 'Sign in',
      body: `<p>Save your programs to your account, to use on any device. Enter your email and we'll send you a link to sign in. There's no password.</p>${policyLinks()}`,
      label: 'Email', type: 'email', value: email, button: 'Email me a link',
    });
    if (email === null) return;
    if (!validEmail(email)) { toast('Please enter your email address.', 'error'); continue; }
    try {
      await sendSignInLink(email);
      break;
    } catch (err) {
      toast(err.offline ? 'You\'re offline. Connect to the internet to sign in.' : 'The link couldn\'t be sent. Check the address and try again.', 'error');
    }
  }
  try { localStorage.setItem(PENDING_EMAIL_KEY, email); } catch { /* they'll be asked for it again */ }
  await modal({
    title: 'We\'ve sent you a link',
    body: `<p>Open the email sent to <strong>${esc(email)}</strong> and tap the link in it. That signs you in, on this device or another.</p>
      <p class="hint">Nothing there after a minute? Look in your spam folder, or try again.</p>`,
    buttons: [{ label: 'OK', value: null, cls: 'btn-primary' }],
  });
}

/** The page was opened from a sign-in link: finish signing in. */
async function completeSignIn(oobCode) {
  history.replaceState(null, '', location.pathname);
  let email = localStorage.getItem(PENDING_EMAIL_KEY) || '';
  if (!email) {
    // Opened on a different device from the one that asked for the link
    email = await askFor({
      title: 'Finish signing in', body: '<p>Enter the email address the link was sent to.</p>',
      label: 'Email', type: 'email', button: 'Sign in',
    });
    if (!email) return;
  }
  try {
    await signInWithLink(email, oobCode);
  } catch (err) {
    toast(err.offline ? 'You\'re offline. Open the link again when you\'re connected.'
      : 'That link has been used or has run out. Press Sign in to get a new one.', 'error');
    return;
  }
  try { localStorage.removeItem(PENDING_EMAIL_KEY); } catch { /* ignore */ }
  renderAccountButton();
  await afterSignIn();
}

/** First sign-in on this device: offer to add what's here to the account, then show the account's programs. */
async function afterSignIn() {
  // A cache left by someone else's account doesn't belong to this one
  if (library.owner && library.owner !== session.uid) {
    library.items = library.items.filter((x) => x.version == null);
    library.deleted = [];
  }
  library.owner = session.uid;
  settingUp = true;
  try { await chooseWhatToAdd(); } finally { settingUp = false; }
  saveLibrary();
  toast(`Signed in as ${session.email}.`);
  await catchUp();   // with nothing of its own here, this opens the newest program in the account
}

async function chooseWhatToAdd() {
  if (unsavedHere()) save();
  try { await loadMe(); } catch { /* offline: carry on with what's here */ }

  const locals = library.items.filter((x) => x.version == null && !x.hold);
  const real = locals.filter((x) => !isBlankProgram(readJSON(programKey(x.id))));
  const hasPrograms = (me?.programs?.count || 0) > 0;
  // An untouched starter program isn't worth a place in the account, if the account has programs of its own
  if (hasPrograms) {
    for (const x of locals.filter((l) => !real.includes(l))) {
      library.items = library.items.filter((i) => i !== x);
      try { localStorage.removeItem(programKey(x.id)); } catch { /* ignore */ }
    }
  }
  if (real.length) {
    const names = real.map((x) => `<strong>${esc(x.name)}</strong>`).join(', ');
    const add = await modal({
      title: `Add ${real.length === 1 ? 'this program' : 'these programs'} to your account?`,
      body: `<p>${names} ${real.length === 1 ? 'is' : 'are'} saved on this device. Adding ${real.length === 1 ? 'it' : 'them'} to your account lets you use ${real.length === 1 ? 'it' : 'them'} on any device.</p>`,
      buttons: [{ label: 'Not now', value: false, cls: 'btn-text' }, { label: 'Add to my account', value: true, cls: 'btn-primary' }],
    });
    if (!add) real.forEach((x) => { x.hold = 'asked'; });
  }
}

async function signOut() {
  closePopover();
  save();
  const waiting = library.items.filter((x) => x.hold || needsUpload(x));
  if (waiting.length) {
    const ok = await modal({
      title: 'Sign out?',
      body: `<p>${waiting.map((x) => `<strong>${esc(x.name)}</strong>`).join(', ')} ${waiting.length === 1 ? 'isn\'t' : 'aren\'t'} in your account yet, and will be removed from this device. Use <strong>Save file</strong> first to keep a copy.</p>`,
      buttons: [{ label: 'Cancel', value: false, cls: 'btn-text' }, { label: 'Sign out', value: true, cls: 'btn-danger' }],
    });
    if (!ok) return;
  }
  clearDevice();
}

/** Signing out clears this device's copy of the account, and starts again with one blank program. */
function clearDevice() {
  clearTimeout(syncTimer);
  try {
    library.items.forEach((x) => localStorage.removeItem(programKey(x.id)));
    // An empty library, not none: this isn't a first visit, so the welcome wizard stays away
    localStorage.setItem(LIB_KEY, JSON.stringify({ current: null, items: [] }));
    localStorage.removeItem(ME_KEY);
  } catch { /* ignore */ }
  setSession(null);
  accountLeaving = true;
  location.reload();
}
let accountLeaving = false;   // stops the page's last save from writing the program back

/* ---------------------------------------------------------------- the Sign in button, its menu and the Account page */

function renderAccountButton() {
  // The app switcher lists the internal dashboard for sysadmins (the API is what refuses everyone else)
  const sysadmin = accountsOn() && signedIn() && !!me?.roles?.includes('sysadmin');
  $$('qs-app-switcher').forEach((el) => el.toggleAttribute('sysadmin', sysadmin));
  // The line under the sidebar says where programs are saved
  const where = $('#saveWhere');
  if (where && accountsOn()) {
    where.innerHTML = signedIn()
      ? 'Your programs save to your account as you work, and on this device when you\'re offline.'
      : 'Your program saves on this device. <strong>Sign in</strong> to save your programs to your account and use them on any device.';
  }
  renderDirectory();
  const btn = $('#btnAccount');
  if (!btn) return;
  btn.hidden = !accountsOn();
  if (signedIn()) {
    const initial = ((me?.user?.name || session.email || '?').trim()[0] || '?').toUpperCase();
    btn.className = 'btn btn-ghost btn-account';
    btn.innerHTML = `<span class="avatar">${esc(initial)}</span>`;
    btn.title = `Signed in as ${session.email}`;
    btn.setAttribute('aria-label', 'Account');
  } else {
    btn.className = 'btn btn-outline btn-signin';
    btn.textContent = 'Sign in';
    btn.title = 'Save your programs to your account, to use on any device';
    btn.removeAttribute('aria-label');
  }
}

function openAccountMenu(anchor) {
  if (!signedIn()) { openSignIn(); return; }
  if (!pop.hidden && popCtx?.type === 'account') { closePopover(); return; }
  openPopover(anchor, `
    <div class="pop-title">${esc(me?.user?.name || 'Your account')}<div class="pop-sub pop-email">${esc(session.email)}</div></div>
    <div class="menu">
      <button id="pAccount"><svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>Account</button>
      <button id="pSignOut"><svg viewBox="0 0 24 24"><path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 8l-4 4 4 4M6 12h9"/></svg>Sign out</button>
    </div>`, { type: 'account' });
  $('#pAccount').onclick = () => { closePopover(); openAccountPage(); };
  $('#pSignOut').onclick = signOut;
}

function planText() {
  const p = me?.programs;
  if (!p) return '';
  if (me.premium?.active) return `qstored Premium · ${p.count} program${p.count === 1 ? '' : 's'}`;
  return `Free account · ${p.count} of ${p.limit} programs`;
}

async function openAccountPage() {
  if (!signedIn()) { openSignIn(); return; }
  try { await loadMe(); } catch { /* offline: show what's known */ }
  const support = ACCOUNT.supportEmail
    ? `<p class="hint">Need a hand? Email <a href="mailto:${esc(ACCOUNT.supportEmail)}">${esc(ACCOUNT.supportEmail)}</a>.</p>` : '';
  const done = modal({
    title: 'Account',
    body: `<div class="account-page">
        <p>Signed in as <strong>${esc(session.email)}</strong><br><span id="acPlan">${esc(planText())}</span></p>
        <div class="account-name"><label class="field"><span>Your name</span><input type="text" id="acName" maxlength="80" value="${esc(me?.user?.name || '')}" placeholder="Shown to other leaders, e.g. Akela"></label>
          <button class="btn btn-outline" id="acSaveName" type="button">Save</button></div>
        <p class="hint">Your account works across qstored's apps. <a href="https://account.qstored.org/" target="_blank" rel="noopener">Manage it at account.qstored.org</a>.</p>
        <div class="account-actions">
          <button class="btn btn-outline" id="acExport" type="button">Download all my programs</button>
          <button class="btn btn-text btn-danger-text" id="acDelete" type="button">Delete my account</button>
        </div>
        <div id="acBin"></div>
        ${support}${policyLinks()}
      </div>`,
    buttons: [{ label: 'Close', value: null, cls: 'btn-primary' }],
  });
  const close = () => $('#modal .modal-actions .btn').click();

  $('#acSaveName').onclick = async () => {
    const name = $('#acName').value.trim();
    if (!name) { toast('Please enter a name.', 'error'); return; }
    try {
      const r = await api('PATCH', '/me', { body: { name } });
      if (!r.ok) { toast(errorText(r), 'error'); return; }
      me = { ...me, user: r.json.user };
      renderAccountButton();
      toast('Name saved.');
    } catch { toast('You\'re offline. Try again when you\'re connected.', 'error'); }
  };
  $('#acExport').onclick = downloadAllPrograms;
  $('#acDelete').onclick = () => { close(); deleteAccount(); };
  renderBin();
  await done;
}

/** Programs deleted in the last 30 days, with Restore. */
async function renderBin() {
  let r;
  try { r = await api('GET', '/programs?owner=me&deleted=true'); } catch { return; }
  const box = $('#acBin');
  if (!box || !r.ok || !r.json.programs.length) return;
  box.innerHTML = `<div class="account-bin-title">Deleted in the last 30 days</div>
    ${r.json.programs.map((p) => `<div class="account-bin-item"><span><b>${esc(p.name)}</b><small>${esc([p.groupName, `deleted ${relTime(Date.parse(p.deletedAt))}`].filter(Boolean).join(' · '))}</small></span>
      <button class="btn btn-outline btn-sm" type="button" data-restore="${esc(p.id)}">Restore</button></div>`).join('')}`;
  box.onclick = async (e) => {
    const b = e.target.closest('[data-restore]');
    if (!b) return;
    b.disabled = true;
    try {
      const back = await api('POST', `/programs/${b.dataset.restore}/restore`);
      if (errorCode(back) === 'program_limit') { $('#modal .modal-actions .btn').click(); showLimitBox(); return; }
      if (!back.ok) { toast(errorText(back), 'error'); b.disabled = false; return; }
      b.closest('.account-bin-item').remove();
      toast('Restored. It\'s back with your programs.');
      await loadMe(); await refreshPrograms();
      const plan = $('#acPlan'); if (plan) plan.textContent = planText();
    } catch { toast('You\'re offline. Try again when you\'re connected.', 'error'); b.disabled = false; }
  };
}

async function downloadAllPrograms() {
  try {
    await runSync();   // so the download has the latest changes
    const r = await api('GET', '/me/export');
    if (!r.ok) { toast(errorText(r), 'error'); return; }
    downloadFile('qstored-programs.zip', await r.res.blob(), 'application/zip');
  } catch { toast('You\'re offline. Try again when you\'re connected.', 'error'); }
}

async function deleteAccount() {
  for (;;) {
    const choice = await modal({
      title: 'Delete your account?',
      body: `<p>Your account and every program in it, including deleted ones, are removed for good, from this device too. This can't be undone.</p>
        <p>To keep your programs, download them first.</p>`,
      buttons: [{ label: 'Cancel', value: null, cls: 'btn-text' }, { label: 'Download my programs', value: 'export', cls: 'btn-outline' },
        { label: 'Delete my account', value: 'delete', cls: 'btn-danger' }],
    });
    if (choice === 'export') { await downloadAllPrograms(); continue; }
    if (choice !== 'delete') return;
    break;
  }
  try {
    const r = await api('DELETE', '/me');
    if (!r.ok) { toast(errorText(r), 'error'); return; }
  } catch (err) {
    if (err.offline) toast('You\'re offline. Try again when you\'re connected.', 'error');
    return;
  }
  clearDevice();
}

/* ---------------------------------------------------------------- start */

/** As the page closes: send the open program's last changes without waiting for the timer. */
function flushOnLeave() {
  if (accountLeaving || !signedIn()) return;
  if (unsavedHere()) save();
  const item = libItem(library.current);
  if (!item || !needsUpload(item) || item.version == null || syncing) return;
  if (session.expiresAt - Date.now() < 5000) return;   // no time to renew the token; it goes next time
  const json = localStorage.getItem(programKey(item.id));
  if (!json || json.length > 60000) return;   // browsers only send small requests from a closing page
  fetch(`${ACCOUNT.apiBase.replace(/\/$/, '')}/api/v1/programs/${item.id}`, {
    method: 'PUT', keepalive: true,
    headers: { Authorization: `Bearer ${session.idToken}`, 'Content-Type': 'application/json', 'If-Match': `"${item.version}"` },
    body: JSON.stringify({ name: item.name, data: JSON.parse(json) }),
  }).catch(() => {});
}

function accountInit() {
  renderAccountButton();
  if (!accountsOn()) { session = null; return; }
  refreshSaveState();
  $('#btnAccount').onclick = (e) => openAccountMenu(e.currentTarget);

  // Signed in or out in another tab (the sign-in link opens one): follow it
  window.addEventListener('storage', (e) => {
    if (e.key === SESSION_KEY && !!e.newValue !== signedIn()) { accountLeaving = true; location.reload(); }
  });
  window.addEventListener('online', catchUp);
  window.addEventListener('pagehide', flushOnLeave);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') catchUp(); });

  const params = new URLSearchParams(location.search);
  if (params.get('mode') === 'signIn' && params.get('oobCode')) completeSignIn(params.get('oobCode'));
  else if (signedIn()) catchUp();
}
