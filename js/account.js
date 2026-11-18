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
  microsoftSignIn: false,   // Sign in with Microsoft: on once it's set up in Firebase and Microsoft Entra
  syncGap: 3000,      // send a save to the API at most this often (ms)
  retryGap: 15000,    // while offline, try again this often (ms)
}, window.QSTORED_CONFIG);

const SESSION_KEY = 'qstored.session';              // { uid, email, idToken, refreshToken, expiresAt }
const PENDING_EMAIL_KEY = 'qstored.pendingEmail';   // the address a sign-in link was sent to, from this browser
const ME_KEY = 'qstored.me';                        // the last GET /me, for limits while offline
const IDP_KEY = 'qstored.idp';                      // { sessionId, at, link }: a Microsoft sign-in under way
const LINK_KEY = 'qstored.linkMicrosoft';           // { email, pendingToken, at }: Microsoft to link after an email link

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

/** Signs in (or out, with null) here and on every other qStored site. */
function setSession(next) {
  keepSession(next ? { ...next, shared: true } : null);
  if (session) writeShared(session); else clearShared();
}

function keepSession(next) {
  session = next;
  try {
    if (next) localStorage.setItem(SESSION_KEY, JSON.stringify(next));
    else localStorage.removeItem(SESSION_KEY);
  } catch { /* signed in for this visit only */ }
}

/*
 * One sign-in for every qStored site: signing in on any of them signs you in on all, and signing out on one
 * signs you out of all. Each site's storage is its own, so the sign-in is also kept in a cookie on
 * qstored.org, which every qstored.org site can read: { uid, email, refreshToken }. A site takes it up when
 * it opens, when its tab is shown again, and before it calls the API; each makes its own short-lived token
 * from it. Locally (not on qstored.org) the cookie is this host's only. The same code is in each qStored
 * site; change them together.
 */
const SHARED_COOKIE = 'qstored_session';
const SHARED_DAYS = 90;   // signed out after this long without opening any qStored site

function sharedAttrs() {
  const domain = /(^|\.)qstored\.org$/.test(location.hostname) ? '; Domain=qstored.org' : '';
  return `; Path=/; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}${domain}`;
}

function readShared() {
  const m = document.cookie.match(/(?:^|;\s*)qstored_session=([^;]*)/);
  if (!m) return null;
  try {
    const v = JSON.parse(decodeURIComponent(m[1]));
    return v && typeof v.uid === 'string' && typeof v.refreshToken === 'string' ? v : null;
  } catch { return null; }
}

function writeShared(s) {
  const value = encodeURIComponent(JSON.stringify({ uid: s.uid, email: s.email, refreshToken: s.refreshToken }));
  document.cookie = `${SHARED_COOKIE}=${value}; Max-Age=${SHARED_DAYS * 86400}${sharedAttrs()}`;
}

function clearShared() { document.cookie = `${SHARED_COOKIE}=; Max-Age=0${sharedAttrs()}`; }

/**
 * Brings this site's sign-in into line with the shared one. Answers 'same', 'out' (signed out on another
 * site) or 'in' (signed in on another site, maybe as someone else).
 */
function syncShared() {
  const shared = readShared();
  if (!shared) {
    if (session?.shared) { keepSession(null); return 'out'; }
    // Signed in here before sign-ins were shared: share it
    if (session) setSession(session);
    return 'same';
  }
  if (session?.uid === shared.uid) {
    if (session.refreshToken !== shared.refreshToken || !session.shared) keepSession({ ...session, refreshToken: shared.refreshToken, shared: true });
    return 'same';
  }
  keepSession({ uid: shared.uid, email: shared.email || '', refreshToken: shared.refreshToken, idToken: '', expiresAt: 0, shared: true });
  return 'in';
}

/** A token the API will accept, renewed when it's about to run out. */
async function idToken(force = false) {
  // Signed in or out on another qStored site since this page looked: start again with that
  if (accountsOn() && syncShared() !== 'same') { accountLeaving = true; location.reload(); throw authError(); }
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
  refreshPublishButton();
}

/** True when the open program is on a live link and has changes families can't see yet. */
function unpublishedChanges() {
  if (!accountsOn() || !signedIn()) return false;
  const item = libItem(library.current);
  if (!item || item.publishedVersion == null) return false;
  return !!item.dirty || (item.version ?? 0) > item.publishedVersion;
}

/** The top bar's Publish button: there only while families see an older version of this program. */
function refreshPublishButton() {
  const b = $('#btnPublish');
  if (b) b.hidden = !unpublishedChanges();
}

/** Publishes the open program: families' page and calendar show it as it is now. */
async function publishCurrent() {
  const id = await programInAccount('Publishing');
  if (!id) return;
  const r = await tryApi('POST', `/programs/${id}/publish`);
  if (!r) return;
  if (errorCode(r) === 'premium_required') { premiumBox('A live link for families', 'A page and calendar for families that show the program you publish.'); return; }
  if (!r.ok) { toast(errorText(r), 'error'); return; }
  const item = libItem(id);
  if (item) { item.publishedVersion = r.json.published.version; saveLibrary(); }
  refreshPublishButton();
  if (typeof renderMobile === 'function' && onPhone()) renderMobile();
  toast('Published. Families see these changes now.');
  return r.json.link ?? null;
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
      section: p.section ?? null, year: p.year, term: p.term, publishedVersion: p.publishedVersion ?? null,
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
  // Once paid plans can be bought (the API has Stripe), Premium is offered beside deleting one
  const billing = me?.billing;
  const canBuy = !!billing?.available;
  const premium = canBuy
    ? `<p>Or get <strong>Premium</strong>, for as many programs as you like: A$4 a month or A$36 a year${billing.trialAvailable ? ', with a 14-day free trial' : ''}. It works in every qStored app.</p>`
    : '<p class="hint">Premium, with as many programs as you like, is on its way.</p>';
  return modal({
    title: `A free account keeps ${limit} programs`,
    body: `${extra}<p>Your account has ${limit} programs already. To keep another, delete one you no longer need. Deleted programs can be brought back for 30 days, under <strong>Data</strong> in your qStored account.</p>
      ${premium}`,
    buttons: canBuy
      ? [{ label: 'Not now', value: null, cls: 'btn-text' }, { label: 'Delete an old program', value: 'delete', cls: 'btn-outline' },
        { label: billing.trialAvailable ? 'Try Premium free' : 'Get Premium', value: 'premium', cls: 'btn-primary' }]
      : [{ label: 'Not now', value: null, cls: 'btn-text' }, { label: 'Delete an old program', value: 'delete', cls: 'btn-primary' }],
  }).then((choice) => {
    if (choice === 'delete') showDirectoryToDelete();
    // Billing, in the account site in a new tab; coming back here picks the new limit up (see start)
    if (choice === 'premium') window.open(`${QSTORED_ACCOUNT_URL}#/billing`, '_blank', 'noopener');
  });
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

const MS_LOGO = '<svg class="ms-logo" viewBox="0 0 21 21" aria-hidden="true"><rect x="1" y="1" width="9" height="9" fill="#f25022"/><rect x="11" y="1" width="9" height="9" fill="#7fba00"/><rect x="1" y="11" width="9" height="9" fill="#00a4ef"/><rect x="11" y="11" width="9" height="9" fill="#ffb900"/></svg>';

/** The sign-in box: Sign in with Microsoft (when it's on), or an email link. Answers the email, 'microsoft' or null. */
function askSignIn(email) {
  const microsoft = ACCOUNT.microsoftSignIn;
  const done = modal({
    title: 'Sign in',
    body: `<p>Save your programs to your account, to use on any device. ${microsoft
      ? 'Sign in with your Microsoft account, or get a link to sign in by email.'
      : 'Enter your email and we\'ll send you a link to sign in. There\'s no password.'}</p>
      ${microsoft ? `<button class="btn btn-ms" type="button" data-i="2">${MS_LOGO}Sign in with Microsoft</button>
        <div class="or"><span>or use an email link</span></div>` : ''}
      <label class="field"><span>Email</span><input type="email" id="askInput" value="${esc(email)}" autocomplete="email"></label>
      ${policyLinks()}`,
    buttons: [{ label: 'Cancel', value: null, cls: 'btn-text' }, { label: 'Email me a link', value: 'ok', cls: 'btn-primary' },
      { label: 'Sign in with Microsoft', value: 'microsoft', inBody: true }],
  });
  const input = $('#askInput');
  if (!microsoft) { input.focus(); input.select(); }
  input.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); $('#modal .btn-primary').click(); } };
  return done.then((choice) => (choice === 'ok' ? input.value.trim() : choice));
}

async function openSignIn() {
  closePopover();
  let email = '';
  for (;;) {
    email = await askSignIn(email);
    if (email === null) return;
    if (email === 'microsoft') { await startMicrosoftSignIn(); return; }
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
  await linkMicrosoft();
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

/* ---------------------------------------------------------------- Sign in with Microsoft */

/*
 * Firebase does the OAuth with Microsoft (its client id and secret are set in the Firebase console), through
 * its REST API, so no script from Google or Microsoft is loaded: createAuthUri gives Microsoft's sign-in
 * address, the leader signs in there and comes back to this page, and signInWithIdp turns what Microsoft
 * sent back into a Firebase sign-in, the same as an email link's.
 */
const idp = (path, body) => firebaseCall('identitytoolkit.googleapis.com', `/v1/accounts:${path}`, body);

/** Off to Microsoft to sign in. `link`: to link Microsoft to the account already signed in. */
async function startMicrosoftSignIn(link = false) {
  let r;
  try {
    r = await idp('createAuthUri', {
      providerId: 'microsoft.com', continueUri: location.origin + location.pathname, customParameter: { prompt: 'select_account' },
    });
    if (!r.authUri) throw new Error('no authUri');
  } catch (err) {
    toast(err.offline ? 'You\'re offline. Connect to the internet to sign in.'
      : 'Sign in with Microsoft isn\'t working just now. Use an email link instead.', 'error');
    return;
  }
  try { localStorage.setItem(IDP_KEY, JSON.stringify({ sessionId: r.sessionId, at: Date.now(), link })); } catch { /* it can't finish without it */ }
  if (state) save();   // the work on screen is kept
  location.assign(r.authUri);
}

/** Microsoft's answer, in this page's address (its query or fragment). */
function idpAnswer() {
  const query = new URLSearchParams(location.search);
  const frag = new URLSearchParams(location.hash.replace(/^#/, ''));
  const get = (k) => query.get(k) ?? frag.get(k);
  return (get('code') || get('id_token') || get('error')) ? { error: get('error'), describe: get('error_description') } : null;
}

/** Back from Microsoft: finish signing in (or linking). */
async function completeMicrosoftSignIn(answer) {
  const pending = readJSON(IDP_KEY);
  const requestUri = location.href;
  try { localStorage.removeItem(IDP_KEY); } catch { /* ignore */ }
  history.replaceState(null, '', location.pathname);
  if (answer.error) {
    toast(answer.error === 'access_denied' ? 'Microsoft sign-in was cancelled.' : 'Microsoft didn\'t sign you in. Try again, or use an email link.', 'error');
    return;
  }
  const linking = pending.link && signedIn();
  let r;
  try {
    r = await idp('signInWithIdp', {
      requestUri, sessionId: pending.sessionId, returnSecureToken: true, returnIdpCredential: true,
      ...(linking ? { idToken: await idToken() } : {}),
    });
  } catch (err) {
    toast(err.offline ? 'You\'re offline. Try again when you\'re connected.'
      : String(err.code || '').startsWith('FEDERATED_USER_ID_ALREADY_LINKED')
        ? 'That Microsoft account is already used by another qStored account.'
        : 'Microsoft sign-in didn\'t finish. Try again, or use an email link.', 'error');
    return;
  }
  if (linking) {
    if (r.idToken) setSession({ ...session, idToken: r.idToken, refreshToken: r.refreshToken || session.refreshToken, expiresAt: Date.now() + (+r.expiresIn || 3600) * 1000 });
    toast('Microsoft is linked. Next time, sign in with Microsoft.');
    catchUp();
    return;
  }
  if (r.needConfirmation || !r.idToken) { await askToLinkMicrosoft(r); return; }
  if (!r.email) { toast('That Microsoft account has no email address, so it can\'t be used here. Use an email link instead.', 'error'); return; }
  setSession({
    uid: r.localId, email: r.email, idToken: r.idToken, refreshToken: r.refreshToken,
    expiresAt: Date.now() + (+r.expiresIn || 3600) * 1000,
  });
  renderAccountButton();
  await afterSignIn();
}

/**
 * The Microsoft account's email already has a qStored account (made with an email link). Firebase keeps one
 * account per email, so this person signs in with an email link once more, and Microsoft is then linked to it.
 */
async function askToLinkMicrosoft(r) {
  const email = r.email || '';
  try { localStorage.setItem(LINK_KEY, JSON.stringify({ email, pendingToken: r.pendingToken || null, at: Date.now() })); } catch { /* ignore */ }
  const choice = await modal({
    title: 'Sign in with your email once',
    body: `<p>There's already a qStored account for <strong>${esc(email || 'this email')}</strong>, from signing in with an email link.
      Sign in that way once more, and Microsoft will be linked to it, so all your programs stay together.</p>`,
    buttons: [{ label: 'Cancel', value: null, cls: 'btn-text' }, { label: 'Email me a link', value: 'send', cls: 'btn-primary' }],
  });
  if (choice !== 'send' || !email) return;
  try {
    await sendSignInLink(email);
  } catch (err) {
    toast(err.offline ? 'You\'re offline. Connect to the internet to sign in.' : 'The link couldn\'t be sent. Try again.', 'error');
    return;
  }
  try { localStorage.setItem(PENDING_EMAIL_KEY, email); } catch { /* they'll be asked for it again */ }
  await modal({
    title: 'We\'ve sent you a link',
    body: `<p>Open the email sent to <strong>${esc(email)}</strong> and tap the link in it. Microsoft is linked once you're signed in.</p>`,
    buttons: [{ label: 'OK', value: null, cls: 'btn-primary' }],
  });
}

/** Signed in with an email link after Microsoft found the account: link Microsoft to it now. */
async function linkMicrosoft() {
  const link = readJSON(LINK_KEY);
  if (!link) return;
  try { localStorage.removeItem(LINK_KEY); } catch { /* ignore */ }
  if (Date.now() - link.at > 24 * 3600e3 || !signedIn() || (link.email && link.email.toLowerCase() !== session.email.toLowerCase())) return;
  if (link.pendingToken) {
    try {
      const r = await idp('signInWithIdp', {
        idToken: await idToken(), pendingToken: link.pendingToken, requestUri: location.origin + location.pathname, returnSecureToken: true,
      });
      if (r.idToken) setSession({ ...session, idToken: r.idToken, refreshToken: r.refreshToken || session.refreshToken, expiresAt: Date.now() + (+r.expiresIn || 3600) * 1000 });
      toast('Microsoft is linked. Next time, sign in with Microsoft.');
      return;
    } catch { /* the pending sign-in ran out: go round by Microsoft again */ }
  }
  const go = await modal({
    title: 'Link Microsoft?',
    body: '<p>You\'re signed in. Sign in with Microsoft once more to link it, and use it from then on.</p>',
    buttons: [{ label: 'Not now', value: false, cls: 'btn-text' }, { label: 'Link Microsoft', value: true, cls: 'btn-primary' }],
  });
  if (go) await startMicrosoftSignIn(true);
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

/* ---------------------------------------------------------------- the Sign in button and its menu */

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
  // Version history is for programs in the account
  const history = $('#btnHistory');
  if (history) history.hidden = !(accountsOn() && signedIn());
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
      <button id="pAccount" title="Your name, plan, billing and data, across qStored's apps (opens account.qstored.org)"><svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>Account</button>
      <button id="pSignOut"><svg viewBox="0 0 24 24"><path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 8l-4 4 4 4M6 12h9"/></svg>Sign out</button>
    </div>`, { type: 'account' });
  $('#pAccount').onclick = () => { closePopover(); openQstoredAccount(); };
  $('#pSignOut').onclick = signOut;
}

/**
 * The qStored account site, in a new tab: the name, plan and billing, and the data (download, the bin of
 * deleted programs, delete the account). The same for every qStored app, so the builder keeps none of it.
 */
const QSTORED_ACCOUNT_URL = 'https://account.qstored.org/';
function openQstoredAccount() { window.open(QSTORED_ACCOUNT_URL, '_blank', 'noopener'); }

/* ---------------------------------------------------------------- start */

/* ---------------------------------------------------------------- Premium: version history and the family link */

const ACCOUNT_BILLING_URL = 'https://account.qstored.org/#/billing';

/** A Premium feature they don't have yet: what it does, and where to get it. */
async function premiumBox(feature, what) {
  const billing = me?.billing;
  const choice = await modal({
    title: `${feature} is part of Premium`,
    body: `<p>${what}</p>
      <p class="hint">${billing?.available
    ? `Premium is A$4 a month or A$36 a year${billing.trialAvailable ? ', with a 14-day free trial' : ''}, and works in every qStored app. A group's Group plan includes it for every leader.`
    : 'Paid plans are on their way.'}</p>`,
    buttons: billing?.available
      ? [{ label: 'Not now', value: null, cls: 'btn-text' }, { label: billing.trialAvailable ? 'Try Premium free' : 'Get Premium', value: 'premium', cls: 'btn-primary' }]
      : [{ label: 'OK', value: null, cls: 'btn-primary' }],
  });
  if (choice === 'premium') window.open(ACCOUNT_BILLING_URL, '_blank', 'noopener');
}

/** The open program, once it's in the account; null (having said why) if it isn't yet. */
async function programInAccount(why) {
  if (!signedIn()) {
    const go = await modal({
      title: 'Sign in first',
      body: `<p>${why} works with programs saved to your qStored account. Signing in is free.</p>`,
      buttons: [{ label: 'Not now', value: null, cls: 'btn-text' }, { label: 'Sign in', value: 'signin', cls: 'btn-primary' }],
    });
    if (go) openSignIn();
    return null;
  }
  const item = libItem(library.current);
  if (!item || item.hold) { toast("This program isn't in your account, so it can't be shared or have a history.", 'error'); return null; }
  if (item.version == null || item.dirty) {
    // Changes here not in the account yet: send them first
    await runSync();
    if (libItem(library.current)?.version == null) { toast("This program hasn't reached your account yet. Try again when you're online.", 'error'); return null; }
  }
  return library.current;
}

/** Calls the API, saying so if it can't be reached. Null if it couldn't. */
async function tryApi(method, path, options) {
  try {
    return await api(method, path, options);
  } catch (err) {
    if (!err.auth) toast('You\'re offline. Try again when you\'re back online.', 'error');
    return null;
  }
}

async function openHistoryBox() {
  const id = await programInAccount('Version history');
  if (!id) return;
  const r = await tryApi('GET', `/programs/${id}/versions`);
  if (!r) return;
  if (errorCode(r) === 'premium_required') {
    premiumBox('Version history', 'Your program is kept as it changes, for 90 days, and any earlier version can be brought back: for when a week was deleted by mistake, or you liked it better before.');
    return;
  }
  if (!r.ok) { toast(errorText(r), 'error'); return; }
  const { versions, current } = r.json;
  const buttons = [{ label: 'Close', value: null, cls: 'btn-primary' }];
  const rows = versions.map((v) => {
    buttons.push({ label: 'Restore', value: v.id, inBody: true });
    const who = v.by?.id === session?.uid ? 'you' : (v.by?.name || 'another leader');
    return `<li><span><b>${esc(relTime(Date.parse(v.at)))}</b> <span class="hint-inline">· before a change by ${esc(who)}</span></span>
      <button class="btn btn-outline btn-sm" data-i="${buttons.length - 1}">Restore</button></li>`;
  }).join('');
  const choice = await modal({
    title: 'Version history',
    body: `<p>Before this program changes, what it was is kept (at most every 10 minutes) for 90 days. Restore one to bring it back: what the program is now is kept too, so you can change your mind.</p>
      <p class="hint">Now: saved ${esc(relTime(Date.parse(current.updatedAt)))}${current.updatedBy?.name ? ` by ${esc(current.updatedBy.id === session?.uid ? 'you' : current.updatedBy.name)}` : ''}.</p>
      ${rows ? `<ul class="history-list" id="historyList">${rows}</ul>` : '<p class="hint" id="historyEmpty">Nothing kept yet. Earlier versions appear here once the program changes.</p>'}`,
    buttons,
  });
  if (!choice) return;
  const v = versions.find((x) => x.id === choice);
  const sure = await modal({
    title: 'Restore this version?',
    body: `<p>The program goes back to how it was ${esc(relTime(Date.parse(v.at)))}. What it is now is kept in the history.</p>`,
    buttons: [{ label: 'Cancel', value: null, cls: 'btn-text' }, { label: 'Restore', value: 'yes', cls: 'btn-primary' }],
  });
  if (!sure) return;
  const back = await tryApi('POST', `/programs/${id}/versions/${encodeURIComponent(choice)}/restore`);
  if (!back) return;
  if (!back.ok) { toast(errorText(back), 'error'); return; }
  storeRemote(back.json);
  toast('Restored. The version you replaced is in the history.');
}

async function openShareBox() {
  const id = await programInAccount('A live link for families');
  if (!id) return;
  const r = await tryApi('GET', `/programs/${id}/share`);
  if (!r) return;
  if (!r.ok) { toast(errorText(r), 'error'); return; }
  let link = r.json.link;
  if (!link && !r.json.premium) {
    premiumBox('A live link for families', 'A page families can bookmark that always shows the latest program, and a calendar they add once that updates itself. No more sending a new PDF after every change.');
    return;
  }
  const section = (state.branding.sectionName || 'section').trim();
  for (;;) {
    if (!link) {
      const on = await modal({
        title: 'A live link for families',
        body: `<p>Turn on one link for your ${esc(section)} programs: a page families add to their home screen once, and a calendar they add once. They show the program as you <b>publish</b> it (this one is published as it is now), so small changes don't reach families until you're ready. They move on to each new term's published program by themselves.</p>
          <p class="hint">Anyone with the link can see the program, so share it with families only (the group's Facebook page or newsletter is fine). It isn't listed by search engines, leaders' phone numbers stay hidden unless you choose to show them, and you can turn it off or make a new link at any time.</p>`,
        buttons: [{ label: 'Not now', value: null, cls: 'btn-text' }, { label: 'Turn on the link', value: 'on', cls: 'btn-primary' }],
      });
      if (!on) return;
      const made = await tryApi('PUT', `/programs/${id}/share`, { body: {} });
      if (!made) return;
      if (errorCode(made) === 'premium_required') { premiumBox('A live link for families', 'A page families can bookmark that always shows the latest program.'); return; }
      if (!made.ok) { toast(errorText(made), 'error'); return; }
      link = made.json.link;
    }
    // Keep the list's record of what's published in step with the API's
    const here = libItem(id);
    if (here) { here.publishedVersion = link.published?.version ?? null; saveLibrary(); refreshPublishButton(); }
    const status = !link.published
      ? `<p class="share-status" id="shareStatus">This program isn't published, so families can't see it. <b>Publish</b> it when it's ready.</p>`
      : link.changed
        ? `<p class="share-status changes" id="shareStatus">You've changed this program since it was published ${esc(relTime(Date.parse(link.published.at)))}. Families see those changes when you <b>publish</b> them.</p>`
        : `<p class="share-status" id="shareStatus">Families see this program as published ${esc(relTime(Date.parse(link.published.at)))}. Changes you make reach them when you publish again.</p>`;
    const showing = link.showing
      ? (link.showingThis
        ? `<p class="share-showing" id="shareShowing">Showing <b>this program</b>${link.chosen ? ', by your choice, until its term ends' : ''}.</p>`
        : `<p class="share-showing" id="shareShowing">Showing <b>${esc(link.showing.name)}</b> now. It moves on to this program ${esc(link.showing.term ? `when Term ${link.showing.term} ends` : 'when that term ends')}, or you can show it now.</p>`)
      : '';
    const pending = modal({
      title: `A live link for your ${section}`,
      body: `${status}${showing}
        <label class="share-label" for="shareUrl">The family page</label>
        <div class="share-link"><input id="shareUrl" type="text" readonly value="${esc(link.url)}"><button class="btn btn-outline btn-sm" type="button" data-copy="shareUrl">Copy</button></div>
        <label class="share-label" for="shareCal">A calendar that updates itself</label>
        <div class="share-link"><input id="shareCal" type="text" readonly value="${esc(link.calendarUrl)}"><button class="btn btn-outline btn-sm" type="button" data-copy="shareCal">Copy</button></div>
        <label class="share-check"><input type="checkbox" id="sharePhones"${link.showPhones ? ' checked' : ''}> Show leaders' phone numbers</label>
        <p class="hint">One link for all your ${esc(section)} programs: it shows the published term that's on (or next), and moves on by itself when a term ends. Families add the page to their home screen and the calendar once, and keep them. If the link has gone further than you meant, make a new link: the old one stops working.</p>`,
      buttons: [{ label: 'Turn off', value: 'off', cls: 'btn-text' }, { label: 'Make a new link', value: 'renew', cls: 'btn-outline' },
        ...(link.showingThis ? [] : [{ label: 'Show this program now', value: 'show', cls: 'btn-outline' }]),
        { label: 'Open the page', value: 'open', cls: 'btn-outline' },
        ...(link.changed ? [{ label: link.published ? 'Publish changes' : 'Publish', value: 'publish', cls: 'btn-primary' }, { label: 'Done', value: null, cls: 'btn-outline' }]
          : [{ label: 'Done', value: null, cls: 'btn-primary' }])],
    });
    const box = $('#modal .modal');
    box.querySelectorAll('[data-copy]').forEach((b) => {
      b.onclick = async (e) => {
        e.stopPropagation();
        const input = $(`#${b.dataset.copy}`);
        try { await navigator.clipboard.writeText(input.value); } catch { input.select(); document.execCommand?.('copy'); }
        b.textContent = 'Copied';
        setTimeout(() => { b.textContent = 'Copy'; }, 1500);
      };
    });
    $('#sharePhones').onchange = async (e) => {
      const want = e.target.checked;
      const changed = await tryApi('PUT', `/programs/${id}/share`, { body: { showPhones: want } });
      if (changed?.ok) { link = changed.json.link; toast(want ? 'Phone numbers now show on the page.' : 'Phone numbers are now hidden.'); } else {
        e.target.checked = !want;
        if (changed) toast(errorText(changed), 'error');
      }
    };
    const choice = await pending;
    if (choice === 'open') { window.open(link.url, '_blank', 'noopener'); return; }
    if (choice === 'publish') {
      if ((await publishCurrent()) !== undefined) {
        const again = await tryApi('GET', `/programs/${id}/share`);
        if (again?.ok && again.json.link) link = again.json.link;
      }
      continue;
    }
    if (choice === 'show') {
      const shown = await tryApi('POST', `/programs/${id}/share/show`);
      if (shown?.ok) { link = shown.json.link; toast('Published, and the link now shows this program.'); } else if (shown) toast(errorText(shown), 'error');
      continue;
    }
    if (choice === 'renew') {
      const sure = await modal({
        title: 'Make a new link?',
        body: `<p>The current link for your ${esc(section)} programs, and the calendar families added with it, stop working straight away. Share the new one with families.</p>`,
        buttons: [{ label: 'Cancel', value: null, cls: 'btn-text' }, { label: 'Make a new link', value: 'yes', cls: 'btn-primary' }],
      });
      if (sure) {
        const renewed = await tryApi('POST', `/programs/${id}/share/renew`);
        if (renewed?.ok) { link = renewed.json.link; toast('New link made. The old one no longer works.'); } else if (renewed) toast(errorText(renewed), 'error');
      }
      continue;
    }
    if (choice === 'off') {
      const sure = await modal({
        title: 'Turn the link off?',
        body: '<p>The page and the calendar stop working for families. You can turn on a new link later.</p>',
        buttons: [{ label: 'Cancel', value: null, cls: 'btn-text' }, { label: 'Turn off', value: 'yes', cls: 'btn-primary' }],
      });
      if (!sure) continue;
      const off = await tryApi('DELETE', `/programs/${id}/share`);
      if (off?.ok) toast('The link is off.');
      else if (off) toast(errorText(off), 'error');
    }
    return;
  }
}

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
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    // Signed in or out on another qStored site: start again with that
    if (syncShared() !== 'same') { accountLeaving = true; location.reload(); return; }
    // A free account may have got Premium in another tab (the account site's Billing): look again
    if (signedIn() && me?.programs?.limit != null) loadMe().catch(() => { /* offline: keep what's here */ });
    catchUp();
  });

  // Signed in or out on another qStored site since this device last looked. Signed out elsewhere, the
  // programs here stay (as when a sign-in runs out); signed in elsewhere, it's a first sign-in here.
  const shared = syncShared();
  renderAccountButton(); refreshSaveState();

  const params = new URLSearchParams(location.search);
  const answer = readJSON(IDP_KEY) ? idpAnswer() : null;
  if (answer) completeMicrosoftSignIn(answer);
  else if (params.get('mode') === 'signIn' && params.get('oobCode')) completeSignIn(params.get('oobCode'));
  else if (signedIn() && (shared === 'in' || (library.owner && library.owner !== session.uid))) afterSignIn();
  else if (signedIn()) catchUp();
}
