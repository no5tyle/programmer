/*
 * Working on a program together, live (the API's POST and DELETE /programs/{id}/live): any program kept in the
 * account, whether a group library's (its leaders together) or a person's own (on their phone and computer at once).
 *
 * While one is open, the builder takes a quick look now and then: every 3 seconds while someone else (or another of
 * their devices) has it open, every 15 seconds otherwise, and straight away on a move from cell to cell. A change is
 * sent about a second after typing stops while someone else is here (js/account.js: syncSoon). Each look says the person is here (and in
 * which cell), and answers with the newest version and who else is here. A newer version is put together with any
 * changes here (js/account.js: takeTheirs) and shown; while someone's typing it waits until they stop.
 *
 * Looks, not a held-open request: Cloud Run bills for every second a request is open. And they stop when the tab has
 * had no typing or clicking for 10 minutes, or been out of sight for 2, starting again as soon as it's used.
 */
const LIVE_TAB = (() => {
  const a = new Uint8Array(12);
  crypto.getRandomValues(a);
  return [...a].map((b) => 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'[b % 62]).join('');
})();
const LIVE_COLOURS = ['#0E7490', '#B45309', '#6D28D9', '#BE123C', '#15803D', '#1D4ED8', '#A21CAF', '#9A3412'];
const LOOK_TOGETHER_MS = 3_000;    // someone else, or another of their devices, has it open
const LOOK_ALONE_MS = 15_000;      // no one else: soon enough to notice another device opening it
const SEND_TOGETHER_MS = 800;      // while together, a change is sent this soon after the last one
const IDLE_AFTER_MS = 10 * 60_000;
const AWAY_AFTER_MS = 2 * 60_000;

const live = { id: null, timer: null, busy: false, again: false, people: [], cell: null, hiddenAt: null, away: false, idle: false, lastUsed: Date.now(), failures: 0, warned: null };

/** Whether the open program can be open elsewhere too: one kept in the account (a group library's, or their own). */
function liveCan() {
  if (typeof signedIn !== 'function' || !accountsOn() || !signedIn()) return false;
  const item = libItem(library.current);
  return !!item && item.version != null && !item.hold && !live.away && !live.idle;
}

/** How soon a change is sent: quickly while someone else has the program open, else the usual gap. */
const liveSendGap = () => (live.id && live.people.length ? SEND_TOGETHER_MS : null);

/** Starts, moves or stops following, to match the program that's open. Called after each render. */
function liveFollow() {
  const want = liveCan() ? library.current : null;
  if (want === live.id) return;
  liveStop();
  if (!want) return;
  live.id = want;
  live.failures = 0;
  liveLook();
}

function liveStop() {
  if (!live.id) return;
  const id = live.id;
  live.id = null;
  clearTimeout(live.timer);
  live.people = [];
  liveShow();
  // "Closed it": sent as the page goes, too
  api('DELETE', `/programs/${id}/live?tab=${LIVE_TAB}`, { keepalive: true }).catch(() => {});
}

/** One look: "I'm here", and what's new. Then the next, sooner while someone else is here. */
async function liveLook() {
  const id = live.id;
  if (!id) return;
  // One at a time: a look asked for meanwhile (a move to another cell, say) follows straight after this one
  if (live.busy) { live.again = true; return; }
  clearTimeout(live.timer);
  live.again = false;
  // No typing or clicking for 10 minutes: stop until there is
  if (Date.now() - live.lastUsed > IDLE_AFTER_MS) { live.idle = true; liveStop(); return; }
  live.busy = true;
  let r = null;
  try { r = await api('POST', `/programs/${id}/live`, { body: { tab: LIVE_TAB, cell: live.cell } }); } catch { /* offline: try again later */ }
  live.busy = false;
  if (live.id !== id) return;
  if (r && !r.ok && [403, 404, 410].includes(r.status)) { liveStop(); return; }   // gone, or no longer theirs
  if (r?.ok) {
    live.failures = 0;
    live.people = r.json.people.filter((p) => p.tab !== LIVE_TAB);
    liveShow();
    const item = libItem(id);
    if (item && r.json.version > (item.version ?? 0) && r.json.by?.tab !== LIVE_TAB) await livePull(id, r.json.by);
  } else live.failures++;
  if (live.id !== id) return;
  if (live.again) { liveLook(); return; }
  const wait = live.failures ? Math.min(LOOK_ALONE_MS * live.failures, 5 * 60_000) : live.people.length ? LOOK_TOGETHER_MS : LOOK_ALONE_MS;
  live.timer = setTimeout(liveLook, wait);
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
    liveLook();
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
    if (!liveCellOf(document.activeElement) && live.cell) { live.cell = null; live.warned = null; liveLook(); }
    // A newer version that waited for the typing to stop
    if (liveWaiting && !busyEditing() && live.id) { liveWaiting = false; livePull(live.id); }
  }, 400);
});

// Used again after 10 idle minutes: start again, and look for anything new straight away
const liveUsed = () => {
  live.lastUsed = Date.now();
  if (live.idle) { live.idle = false; liveFollow(); }
};
for (const type of ['keydown', 'pointerdown', 'wheel']) document.addEventListener(type, liveUsed, { passive: true, capture: true });

// Out of sight for 2 minutes: stop; back: start again (and look straight away)
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    live.hiddenAt = Date.now();
    setTimeout(() => { if (document.hidden && live.hiddenAt && Date.now() - live.hiddenAt >= AWAY_AFTER_MS) { live.away = true; liveStop(); } }, AWAY_AFTER_MS);
  } else {
    live.hiddenAt = null;
    live.away = false;
    live.lastUsed = Date.now();
    live.idle = false;
    if (live.id) liveLook(); else liveFollow();
  }
});
window.addEventListener('pagehide', () => liveStop());
