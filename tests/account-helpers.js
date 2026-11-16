// A stand-in for the API and for Firebase's sign-in, for the account tests. It keeps programs with
// versions, the bin and the free cap, as the real API does (see the programmer-api repository).
const { fontsLoaded } = require('./helpers');

// The real API's address: the page's Content-Security-Policy only lets it talk to that one
const API = 'https://api.qstored.org';
const CORS = {
  'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization,content-type,if-match',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE', 'Access-Control-Expose-Headers': 'ETag',
};
const SIGN_IN_LINK = '/?mode=signIn&oobCode=good-code';
const SESSION = { uid: 'u1', email: 'akela@example.com', idToken: 'token-1', refreshToken: 'refresh-1' };

/** A program as the account holds it. */
function program(id, data, patch = {}) {
  return {
    id, name: 'Cubs Program', groupName: data?.branding?.groupName || '', owner: 'me', version: 1,
    section: data?.branding?.section ?? null, year: data?.term?.year ?? null, term: data?.term?.term ?? null,
    updatedAt: new Date().toISOString(), updatedBy: { id: 'u1', name: 'Akela' }, deletedAt: null, data, ...patch,
  };
}

/**
 * Routes the page's calls to the API and Firebase to a fake account.
 * Options: signedIn (the test then opens SIGN_IN_LINK to arrive signed in), limit (the cap; null for none), programs.
 */
async function mockAccount(page, { signedIn = false, limit = 3, programs = [] } = {}) {
  const server = {
    programs: new Map(programs.map((p) => [p.id, p])),
    limit, name: '', deleted: false, offline: false, rejectTokens: false, sysadmin: false,
    calls: [],      // 'METHOD /path' for each API call
    sent: [],       // the bodies of Firebase calls
    live() { return [...this.programs.values()].filter((p) => !p.deletedAt); },
    called(prefix) { return this.calls.filter((c) => c.startsWith(prefix)); },
  };

  await page.addInitScript(([api, email]) => {
    window.QSTORED_CONFIG = { apiBase: api, firebaseApiKey: 'test-key', supportEmail: 'help@example.com', syncGap: 30, retryGap: 150 };
    // signedIn: the test opens the app from a sign-in link (SIGN_IN_LINK), as a leader would arrive
    if (email && !localStorage.getItem('qstored.session')) localStorage.setItem('qstored.pendingEmail', email);
  }, [API, signedIn ? SESSION.email : null]);

  const json = (route, status, body, headers = {}) => route.fulfill({
    status, headers: { ...CORS, ...headers }, contentType: 'application/json', body: JSON.stringify(body),
  });
  const error = (route, status, code, extra = {}) => json(route, status, { error: { code, message: `(${code})` }, ...extra });

  await page.route(/identitytoolkit\.googleapis\.com|securetoken\.googleapis\.com/, async (route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    const url = req.url();
    server.sent.push({ url, body: req.postData() });
    if (url.includes('sendOobCode')) return json(route, 200, { email: JSON.parse(req.postData()).email });
    if (url.includes('signInWithEmailLink')) {
      const { email, oobCode } = JSON.parse(req.postData());
      if (oobCode !== 'good-code') return json(route, 400, { error: { message: 'INVALID_OOB_CODE' } });
      return json(route, 200, { localId: SESSION.uid, email, idToken: SESSION.idToken, refreshToken: SESSION.refreshToken, expiresIn: '3600' });
    }
    if (server.rejectTokens) return json(route, 400, { error: { message: 'TOKEN_EXPIRED' } });
    return json(route, 200, { id_token: 'token-2', refresh_token: 'refresh-2', expires_in: '3600' });
  });

  await page.route(`${API}/**`, async (route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    if (server.offline) return route.abort('internetdisconnected');
    const url = new URL(req.url());
    const path = url.pathname.replace('/api/v1', '');
    const method = req.method();
    server.calls.push(`${method} ${path}${url.search}`);
    if (server.rejectTokens || !/^Bearer token-/.test(req.headers().authorization || '')) return error(route, 401, 'not_signed_in');
    const body = req.postData() ? JSON.parse(req.postData()) : null;
    const summary = ({ data, ...rest }) => rest;
    const full = () => server.limit !== null && server.live().length >= server.limit;

    if (path === '/me' && method === 'GET') {
      return json(route, 200, {
        user: { id: SESSION.uid, email: SESSION.email, name: server.name, createdAt: '2026-01-01T00:00:00.000Z' },
        premium: { active: server.limit === null, via: server.limit === null ? 'individual' : null, trial: false, until: null },
        programs: { count: server.live().length, limit: server.limit }, groups: [],
        roles: server.sysadmin ? ['sysadmin'] : [],
      });
    }
    if (path === '/me' && method === 'PATCH') {
      server.name = body.name;
      return json(route, 200, { user: { id: SESSION.uid, email: SESSION.email, name: server.name } });
    }
    if (path === '/me' && method === 'DELETE') { server.deleted = true; server.programs.clear(); return route.fulfill({ status: 204, headers: CORS }); }
    if (path === '/me/export') return route.fulfill({ status: 200, headers: CORS, contentType: 'application/zip', body: Buffer.from('PK-test') });

    if (path === '/programs' && method === 'GET') {
      const bin = url.searchParams.get('deleted') === 'true';
      return json(route, 200, { programs: [...server.programs.values()].filter((p) => !!p.deletedAt === bin).map(summary) });
    }
    if (path === '/programs' && method === 'POST') {
      if (server.programs.has(body.id)) return error(route, 409, 'program_exists');
      if (full()) return error(route, 403, 'program_limit', { limit: server.limit });
      const p = program(body.id, body.data, { name: body.name });
      server.programs.set(p.id, p);
      return json(route, 201, p, { ETag: '"1"' });
    }
    const [, id, action] = /^\/programs\/([^/]+)(?:\/(restore))?$/.exec(path) || [];
    const p = id && server.programs.get(id);
    if (!p) return error(route, 404, 'not_found');
    if (action === 'restore') {
      if (p.deletedAt && full()) return error(route, 403, 'program_limit', { limit: server.limit });
      p.deletedAt = null;
      return json(route, 200, summary(p));
    }
    if (method === 'DELETE') { p.deletedAt = p.deletedAt || new Date().toISOString(); return route.fulfill({ status: 204, headers: CORS }); }
    if (p.deletedAt) return error(route, 410, 'program_deleted');
    if (method === 'GET') return json(route, 200, p, { ETag: `"${p.version}"` });
    if (method === 'PUT') {
      if (req.headers()['if-match'] !== `"${p.version}"`) return error(route, 412, 'version_conflict', { program: p });
      Object.assign(p, { name: body.name, data: body.data, version: p.version + 1, updatedAt: new Date().toISOString(), groupName: body.data?.branding?.groupName || '' });
      return json(route, 200, summary(p), { ETag: `"${p.version}"` });
    }
    return error(route, 404, 'not_found');
  });

  return server;
}

/** Opens the app (at `path`), past the first-visit wizard, and waits until it has rendered. */
async function openAccountApp(page, path = '/') {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  // A refused or dropped request logs a console error of the browser's own; those are expected here
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|net::ERR_/.test(m.text())) errors.push(m.text()); });
  await page.addInitScript(() => { if (!localStorage.getItem('scoutProgramBuilder.welcome')) localStorage.setItem('scoutProgramBuilder.welcome', 'done'); });
  await page.goto(path);
  await page.waitForFunction(() => typeof state === 'object' && document.querySelector('#fitStatus')?.textContent !== '—');
  await fontsLoaded(page);
  return errors;
}

/** Makes a change the way typing does: into `state`, then the debounced save. */
async function edit(page, activity) {
  await page.evaluate((a) => { state.rows[0].activity = a; renderDoc(); saveSoon(); }, activity);
  await page.waitForFunction(() => !unsavedHere());
}

module.exports = { API, SESSION, SIGN_IN_LINK, program, mockAccount, openAccountApp, edit };
