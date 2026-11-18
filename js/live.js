/*
 * Working on a program together, live (the API's /programs/{id}/live and /here).
 *
 * While a program from the account is open, the builder keeps one long poll going: it answers as soon as another
 * leader (or another device) saves a new version, or someone opens, moves about in or closes the program. A new
 * version is put together with any changes here (js/account.js: takeTheirs) and shown; while someone's typing it
 * waits until they stop. Every 30 seconds, and as they move from cell to cell, the builder says the person is here
 * and where, so others see them in the bar and an outline on the cell they're in.
 *
 * It stops when the tab has been out of sight for 3 minutes, and starts again when it's back.
 */
const LIVE_TAB = (() => {
  const a = new Uint8Array(12);
  crypto.getRandomValues(a);
  return [...a].map((b) => 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'[b % 62]).join('');
})();
const LIVE_COLOURS = ['#0E7490', '#B45309', '#6D28D9', '#BE123C', '#15803D', '#1D4ED8', '#A21CAF', '#9A3412'];
const HERE_EVERY_MS = 30_000;
const AWAY_AFTER_MS = 3 * 60_000;

const live = { id: null, ctl: null, seen: '', people: [], cell: null, beat: null, hiddenAt: null, away: false, failures: 0, warned: null };

/** Whether the open program is one the account keeps (so others can have it open too). */
function liveCan() {
  if (typeof signedIn !== 'function' || !accountsOn() || !signedIn()) return false;
  const item = libItem(library.current);
  return !!item && item.version != null && !item.hold && !live.away;
}

/** Starts, moves or stops following, to match the program that's open. Called after each render. */
function liveFollow() {
  const want = liveCan() ? library.current : null;
  if (want === live.id) return;
  liveStop();
  if (!want) return;
  live.id = want;
  live.seen = '';
  live.failures = 0;
  livePoll(want);
  liveHere();
  live.beat = setInterval(liveHere, HERE_EVERY_MS);
}

function liveStop() {
  if (!live.id) return;
  const id = live.id;
  live.id = null;
  live.ctl?.abort();
  clearInterval(live.beat);
  live.people = [];
  liveShow();
  // "Closed it": sent as the page goes, too
  api('DELETE', `/programs/${id}/here?tab=${LIVE_TAB}`, { keepalive: true }).catch(() => {});
}

async function livePoll(id) {
  while (live.id === id) {
    const item = libItem(id);
    if (!item) return;
    live.ctl = new AbortController();
    let r;
    try {
      r = await api('GET', `/programs/${id}/live?version=${item.version ?? 0}&seen=${encodeURIComponent(live.seen)}&wait=40`, { signal: live.ctl.signal });
    } catch {
      if (live.id !== id) return;
      // Offline, or the API's busy: try again in a while
      live.failures++;
      await new Promise((res) => setTimeout(res, Math.min(5000 * live.failures, 30_000)));
      continue;
    }
    if (live.id !== id) return;
    if (!r.ok) {
      // Gone, or no longer theirs: the next look at the list sorts it out
      if (r.status === 404 || r.status === 410 || r.status === 403) { liveStop(); return; }
      live.failures++;
      await new Promise((res) => setTimeout(res, Math.min(5000 * live.failures, 30_000)));
      continue;
    }
    live.failures = 0;
    live.seen = r.json.seen;
    live.people = r.json.people.filter((p) => p.tab !== LIVE_TAB);
    liveShow();
    const now = libItem(id);
    if (now && r.json.version > (now.version ?? 0) && r.json.by?.tab !== LIVE_TAB) await livePull(id, r.json.by);
  }
}

/** Fetches the newer version and puts it together with what's here. */
async function livePull(id, by) {
  const got = await api('GET', `/programs/${id}`).catch(() => null);
  if (!got?.ok || library.current !== id) return;
  const item = libItem(id);
  if (!item || got.json.version <= (item.version ?? 0)) return;
  if (await takeTheirs(id, got.json, by || got.json.updatedBy)) return;
  // No base to start from: with nothing changed here, simply take it; otherwise the next save asks
  if (!item.dirty && !unsavedHere()) storeRemote(got.json);
}

/** Says "I'm here (in this cell)". */
function liveHere() {
  if (!live.id) return;
  api('POST', `/programs/${live.id}/here`, { body: { tab: LIVE_TAB, cell: live.cell } }).catch(() => {});
}

/** The cell an element is in, as "{rowId}:{column}", or null. */
function liveCellOf(el) {
  const td = el?.closest?.('#sheet tr[data-id] td');
  if (!td) return null;
  const col = [...td.classList].find((c) => c.startsWith('c-'));
  return col ? `${td.closest('tr').dataset.id}:${col.slice(2)}` : null;
}

const liveColour = (uid) => LIVE_COLOURS[[...uid].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7) % LIVE_COLOURS.length];
const liveInitial = (name) => (name || '?').trim().charAt(0).toUpperCase() || '?';

/** Who else is here, in the bar, and an outline on each cell someone's in. */
function liveShow() {
  const bar = document.getElementById('livePeople');
  if (bar) {
    const people = [...new Map(live.people.map((p) => [p.id, p])).values()];   // one each, whatever their devices
    bar.hidden = people.length === 0;
    bar.innerHTML = people.map((p) => {
      const who = p.id === session?.uid ? 'You, on another device' : p.name;
      return `<span class="live-avatar" style="--c:${liveColour(p.id)}" title="${esc(who)}: has this program open">${esc(liveInitial(p.name))}</span>`;
    }).join('');
  }
  liveMarkCells();
}

function liveMarkCells() {
  document.querySelectorAll('#sheet td.live-cell').forEach((td) => {
    td.classList.remove('live-cell'); td.style.removeProperty('--c'); delete td.dataset.who;
    td.querySelector(':scope > .live-tag')?.remove();
  });
  for (const p of live.people) {
    if (!p.cell) continue;
    const [row, col] = p.cell.split(':');
    const td = document.querySelector(`#sheet tr[data-id="${CSS.escape(row)}"] td.c-${CSS.escape(col)}`);
    if (!td) continue;
    td.classList.add('live-cell');
    td.style.setProperty('--c', liveColour(p.id));
    td.dataset.who = p.id === session?.uid ? 'You' : p.name;
    const tag = document.createElement('span');
    tag.className = 'live-tag';
    tag.setAttribute('aria-hidden', 'true');
    tag.textContent = td.dataset.who;
    td.append(tag);
  }
}

// Moving from cell to cell: said straight away (a moment's pause, so a quick move doesn't say "nowhere" first)
let liveMoveTimer = null;
document.addEventListener('focusin', (e) => {
  const cell = liveCellOf(e.target);
  clearTimeout(liveMoveTimer);
  if (cell && cell !== live.cell) {
    live.cell = cell;
    liveHere();
    // Someone else is in this cell: say so, once
    const other = live.people.find((p) => p.cell === cell);
    if (other && live.warned !== cell) {
      live.warned = cell;
      toast(`${other.id === session?.uid ? 'You have' : `${other.name} has`} this cell open too. Whichever change is saved last is kept.`);
    }
  }
});
document.addEventListener('focusout', () => {
  clearTimeout(liveMoveTimer);
  liveMoveTimer = setTimeout(() => {
    if (!liveCellOf(document.activeElement) && live.cell) { live.cell = null; live.warned = null; liveHere(); }
    // A newer version that waited for the typing to stop
    if (liveWaiting && !busyEditing() && live.id) { liveWaiting = false; livePull(live.id); }
  }, 400);
});

// Out of sight for 3 minutes: stop; back: start again (and look for anything new straight away)
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    live.hiddenAt = Date.now();
    setTimeout(() => { if (document.hidden && live.hiddenAt && Date.now() - live.hiddenAt >= AWAY_AFTER_MS) { live.away = true; liveStop(); } }, AWAY_AFTER_MS);
  } else {
    live.hiddenAt = null;
    live.away = false;
    liveFollow();
  }
});
window.addEventListener('pagehide', () => liveStop());
