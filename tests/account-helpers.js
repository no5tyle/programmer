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
async function mockAccount(page, { signedIn = false, limit = 3, programs = [], microsoft = false, groups = [] } = {}) {
  const server = {
    // Sign in with Microsoft: 'new' (a new account), 'existing' (its email already has an account), 'cancel', 'noemail'
    microsoft: 'new', linked: false,
    programs: new Map(programs.map((p) => [p.id, p])),
    limit, name: '', deleted: false, offline: false, rejectTokens: false, sysadmin: false,
    calls: [],      // 'METHOD /path' for each API call
    sent: [],       // the bodies of Firebase calls
    // Premium's history and live links: each program's earlier versions, and its link if turned on
    history: new Map(), links: new Map(), billing: null,
    published: new Map(),   // program id → the version families see
    // Groups the person is in ({ id, name, role, plan }), and each one's styling for new programs
    groups, defaults: new Map(),
    live() { return [...this.programs.values()].filter((p) => !p.deletedAt && (p.owner || 'me') === 'me'); },
    called(prefix) { return this.calls.filter((c) => c.startsWith(prefix)); },
  };

  await page.addInitScript(([api, email, microsoft]) => {
    window.QSTORED_CONFIG = { apiBase: api, firebaseApiKey: 'test-key', supportEmail: 'help@example.com', syncGap: 30, retryGap: 150, microsoftSignIn: microsoft };
    // signedIn: the test opens the app from a sign-in link (SIGN_IN_LINK), as a leader would arrive
    if (email && !localStorage.getItem('qstored.session')) localStorage.setItem('qstored.pendingEmail', email);
  }, [API, signedIn ? SESSION.email : null, microsoft]);

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
    // Sign in with Microsoft: createAuthUri gives Microsoft's address; signInWithIdp takes what it sent back
    if (url.includes('createAuthUri')) {
      const { providerId, continueUri } = JSON.parse(req.postData());
      return json(route, 200, {
        providerId, sessionId: 'session-ms',
        authUri: `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?redirect_uri=${encodeURIComponent(continueUri)}&state=st1`,
      });
    }
    if (url.includes('signInWithIdp')) {
      const body = JSON.parse(req.postData());
      const tokens = { localId: SESSION.uid, email: SESSION.email, idToken: SESSION.idToken, refreshToken: SESSION.refreshToken, expiresIn: '3600', providerId: 'microsoft.com' };
      if (body.idToken && (body.pendingToken === 'pending-ms' || body.requestUri.includes('code=ms-code'))) { server.linked = true; return json(route, 200, tokens); }
      if (body.sessionId !== 'session-ms' || !body.requestUri.includes('code=ms-code')) return json(route, 400, { error: { message: 'INVALID_IDP_RESPONSE' } });
      if (server.microsoft === 'existing') return json(route, 200, { needConfirmation: true, email: SESSION.email, providerId: 'microsoft.com', pendingToken: 'pending-ms' });
      if (server.microsoft === 'noemail') return json(route, 200, { ...tokens, email: undefined });
      return json(route, 200, tokens);
    }
    if (server.rejectTokens) return json(route, 400, { error: { message: 'TOKEN_EXPIRED' } });
    return json(route, 200, { id_token: 'token-2', refresh_token: 'refresh-2', expires_in: '3600' });
  });

  // Microsoft's sign-in page: straight back to the app, as if the leader had signed in (or cancelled)
  await page.route('https://login.microsoftonline.com/**', (route) => {
    const back = new URL(new URL(route.request().url()).searchParams.get('redirect_uri'));
    if (server.microsoft === 'cancel') back.search = '?error=access_denied&error_description=cancelled&state=st1';
    else back.search = '?code=ms-code&state=st1';
    return route.fulfill({ status: 302, headers: { Location: back.href } });
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
    const summary = ({ data, ...rest }) => ({ ...rest, publishedVersion: server.published.get(rest.id) ?? null });
    const full = () => server.limit !== null && server.live().length >= server.limit;

    if (path === '/me' && method === 'GET') {
      return json(route, 200, {
        user: { id: SESSION.uid, email: SESSION.email, name: server.name, createdAt: '2026-01-01T00:00:00.000Z' },
        premium: { active: server.limit === null, via: server.limit === null ? 'individual' : null, trial: false, until: null },
        programs: { count: server.live().length, limit: server.limit }, groups: server.groups,
        ...(server.billing ? { billing: server.billing } : {}),
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
      const owner = url.searchParams.get('owner') || 'me';
      if (owner !== 'me' && !server.groups.some((g) => owner === `group:${g.id}`)) return error(route, 404, 'not_found');
      return json(route, 200, { programs: [...server.programs.values()].filter((p) => !!p.deletedAt === bin && (p.owner || 'me') === owner).map(summary) });
    }
    if (path === '/programs' && method === 'POST') {
      if (server.programs.has(body.id)) return error(route, 409, 'program_exists');
      const library = body.owner && body.owner !== 'me';
      if (library && !server.groups.some((g) => body.owner === `group:${g.id}` && g.plan)) return error(route, 402, 'premium_required');
      if (!library && full()) return error(route, 403, 'program_limit', { limit: server.limit });
      const p = program(body.id, body.data, { name: body.name, owner: body.owner || 'me' });
      server.programs.set(p.id, p);
      return json(route, 201, p, { ETag: '"1"' });
    }
    // Version history and the live link (Premium: no cap here means Premium)
    const premium = server.limit === null;
    const vh = /^\/programs\/([^/]+)\/versions(?:\/([^/]+)\/restore)?$/.exec(path);
    if (vh) {
      const p = server.programs.get(vh[1]);
      if (!p) return error(route, 404, 'not_found');
      if (!premium) return error(route, 402, 'premium_required');
      const kept = server.history.get(p.id) || [];
      if (!vh[2]) {
        return json(route, 200, {
          current: { version: p.version, updatedAt: p.updatedAt, updatedBy: p.updatedBy },
          versions: kept.map(({ data, ...v }) => v),
        });
      }
      const v = kept.find((x) => x.id === decodeURIComponent(vh[2]));
      if (!v) return error(route, 404, 'not_found');
      kept.unshift({ id: `${p.id}_${p.version}`, at: new Date().toISOString(), by: { id: 'u1', name: 'Akela' }, name: p.name, version: p.version, data: p.data });
      server.history.set(p.id, kept);
      Object.assign(p, { data: v.data, version: p.version + 1, updatedAt: new Date().toISOString() });
      return json(route, 200, p, { ETag: `"${p.version}"` });
    }
    const pub = /^\/programs\/([^/]+)\/publish$/.exec(path);
    if (pub) {
      const p = server.programs.get(pub[1]);
      if (!p) return error(route, 404, 'not_found');
      if (!premium) return error(route, 402, 'premium_required');
      server.published.set(p.id, p.version);
      return json(route, 200, { link: null, published: { at: new Date().toISOString(), version: p.version } });
    }
    const sh = /^\/programs\/([^/]+)\/share(\/renew|\/show)?$/.exec(path);
    if (sh) {
      const p = server.programs.get(sh[1]);
      if (!p) return error(route, 404, 'not_found');
      const section = p.data?.branding?.section || 'program';
      const linkJson = (l) => {
        const shown = server.programs.get(l.pinned) || [...server.programs.values()].find((x) => (x.data?.branding?.section || 'program') === section && !x.deletedAt);
        return {
          url: `https://api.qstored.org/p/${l.slug}`, calendarUrl: `webcal://api.qstored.org/p/${l.slug}.ics`, calendarFileUrl: `https://api.qstored.org/p/${l.slug}.ics`,
          showPhones: l.showPhones, section, showing: shown ? { id: shown.id, name: shown.name, term: shown.term } : null,
          showingThis: shown?.id === p.id, chosen: !!l.pinned && shown?.id === l.pinned,
          published: server.published.has(p.id) ? { at: new Date().toISOString(), version: server.published.get(p.id) } : null,
          changed: !server.published.has(p.id) || p.version > server.published.get(p.id),
        };
      };
      let link = server.links.get(section);
      if (method === 'GET') return json(route, 200, { link: link ? linkJson(link) : null, premium });
      if (method === 'DELETE') { server.links.delete(section); return route.fulfill({ status: 204, headers: CORS }); }
      if (!premium) return error(route, 402, 'premium_required');
      if (sh[2] === '/renew') { link = { ...link, slug: `renewed${link.slug}` }; server.links.set(section, link); return json(route, 200, { link: linkJson(link) }); }
      if (sh[2] === '/show') { server.published.set(p.id, p.version); link = { ...link, pinned: p.id }; server.links.set(section, link); return json(route, 200, { link: linkJson(link) }); }
      if (!link && !server.published.has(p.id)) server.published.set(p.id, p.version);   // turning it on publishes this one
      link = { slug: link?.slug || 'abcdefghijklmnopqrstuvwx', showPhones: body?.showPhones ?? link?.showPhones ?? false, pinned: link?.pinned ?? null };
      server.links.set(section, link);
      return json(route, 201, { link: linkJson(link) });
    }
    // A group's library: its styling, and moving programs in and out
    const lib = /^\/groups\/([^/]+)\/library(\/defaults)?$/.exec(path);
    if (lib) {
      const g = server.groups.find((x) => x.id === lib[1]);
      if (!g) return error(route, 404, 'not_found');
      const manages = g.role !== 'leader';
      if (method === 'GET') return json(route, 200, { plan: !!g.plan, canManage: manages, defaults: server.defaults.get(g.id) || null });
      if (!manages) return error(route, 403, 'not_allowed');
      const d = { data: body.data, updatedAt: new Date().toISOString(), updatedBy: { id: 'u1', name: 'Akela' } };
      server.defaults.set(g.id, d);
      return json(route, 200, { defaults: d });
    }
    const mv = /^\/programs\/([^/]+)\/move$/.exec(path);
    if (mv) {
      const p = server.programs.get(mv[1]);
      if (!p) return error(route, 404, 'not_found');
      if (body.to === 'me' && full()) return error(route, 403, 'program_limit', { limit: server.limit });
      p.owner = body.to;
      return json(route, 200, summary(p));
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
      if (premium) {
        const kept = server.history.get(p.id) || [];
        kept.unshift({ id: `${p.id}_${p.version}`, at: new Date().toISOString(), by: { id: 'u1', name: 'Akela' }, name: p.name, version: p.version, data: p.data });
        server.history.set(p.id, kept);
      }
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
