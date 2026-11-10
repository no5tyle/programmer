/* Scout Program Builder — all state lives in `state` and is saved to localStorage. */
'use strict';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const STORE_KEY = 'scoutProgramBuilder.v1';            // single-program storage (before the library)
const LIB_KEY = 'scoutProgramBuilder.library.v1';      // { current, items: [{ id, name, group, updated }] }
const programKey = (id) => `scoutProgramBuilder.program.${id}`;

let state;
let library = { current: null, items: [] };
let undoStack = [];
let zoom = 'fit';

/* ---------------------------------------------------------------- utils */

const uid = () => Math.random().toString(36).slice(2, 10);
const clone = (o) => JSON.parse(JSON.stringify(o));
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

function parseDate(iso) {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}
function toISO(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function addDays(d, n) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }
function dayDiff(a, b) { return Math.round((b - a) / 864e5); }

function formatDate(iso) {
  const d = parseDate(iso);
  if (!d) return '';
  const f = state.options.dateFormat;
  // Non-breaking space between day and month: a date may only wrap after the weekday.
  if (f === 'long') return `${DAY_LONG[d.getDay()]} ${d.getDate()}\u00a0${MONTH_LONG[d.getMonth()]}`;
  if (f === 'numeric') return `${DAY_SHORT[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}`;
  return `${DAY_SHORT[d.getDay()]} ${d.getDate()}\u00a0${MONTH_SHORT[d.getMonth()]}`;
}

function formatTime(hhmm) {
  if (!hhmm) return '';
  const [h, m] = hhmm.split(':').map(Number);
  if (state.term.timeFormat === '12') {
    const ap = h >= 12 ? 'PM' : 'AM';
    return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${ap}`;
  }
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function defaultTimeText() {
  const s = formatTime(state.term.startTime), e = formatTime(state.term.endTime);
  if (!s) return '';
  if (!e) return s;
  return state.term.timeLayout === 'stacked' ? `${s}\n${e}` : `${s}–${e}`;
}

function luminance(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return 0.5;
  const n = parseInt(m[1], 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}
const readableOn = (hex) => (luminance(hex) > 0.4 ? '#1d1d1f' : '#ffffff');

function getPath(obj, path) { return path.split('.').reduce((o, k) => (o == null ? o : o[k]), obj); }
function setPath(obj, path, val) {
  const keys = path.split('.'); const last = keys.pop();
  keys.reduce((o, k) => o[k], obj)[last] = val;
}

function toast(msg, kind = '') {
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.textContent = msg;
  $('#toasts').appendChild(el);
  setTimeout(() => el.classList.add('out'), 3800);
  setTimeout(() => el.remove(), 4200);
}

function modal({ title, body, buttons }) {
  return new Promise((resolve) => {
    const back = $('#modal'); const box = $('.modal', back);
    box.innerHTML = `<h2>${esc(title)}</h2><div class="modal-body">${body}</div>
      <div class="modal-actions">${buttons.map((b, i) => `<button class="btn ${b.cls || 'btn-outline'}" data-i="${i}">${esc(b.label)}</button>`).join('')}</div>`;
    back.hidden = false;
    const done = (v) => { back.hidden = true; document.removeEventListener('keydown', onKey); resolve(v); };
    const onKey = (e) => { if (e.key === 'Escape') done(null); };
    document.addEventListener('keydown', onKey);
    box.onclick = (e) => { const b = e.target.closest('[data-i]'); if (b) done(buttons[+b.dataset.i].value); };
    back.onclick = (e) => { if (e.target === back) done(null); };
    $('.btn-primary, .btn-danger', box)?.focus();
  });
}

function readImage(file, max = 400) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onerror = reject;
    fr.onload = () => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        const w = img.naturalWidth || max, h = img.naturalHeight || max;
        const sc = Math.min(1, max / Math.max(w, h));
        const c = document.createElement('canvas');
        c.width = Math.round(w * sc); c.height = Math.round(h * sc);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL('image/png'));
      };
      img.src = fr.result;
    };
    fr.readAsDataURL(file);
  });
}
function pickImage() {
  return new Promise((resolve) => {
    const input = $('#fileImage');
    input.value = '';
    input.onchange = async () => {
      const f = input.files[0];
      if (!f) return resolve(null);
      try { resolve(await readImage(f)); } catch { toast('That image could not be read.', 'error'); resolve(null); }
    };
    input.click();
  });
}

/* ---------------------------------------------------------------- state */

function newRow(date = '', patch = {}) {
  return {
    id: uid(), date, endDate: '', dateLabel: '', time: defaultTimeText(),
    activity: '', description: '', uniform: 'Yes', forms: '', where: '', patrol: '',
    leader: '', cost: '', challenge: '', notes: '', category: '', ...patch,
  };
}

function defaultState() {
  const s = {
    v: 1,
    branding: {
      groupName: '', section: 'cubs', sectionName: 'Cubs', color: SECTIONS.cubs.color,
      titleTemplate: '{section} Program – Term {term} {year}', titleColor: 'dark', headerStyle: 'tint',
      font: 'Nunito', logo: null, versionText: '', footerText: '', leadersLabel: 'Leaders:',
      leaders: [{ name: 'Leader name', phone: '0400 000 000' }, { name: 'Leader name', phone: '0400 000 000' }],
    },
    term: {
      region: 'SA', year: 2026, term: 4, start: '2026-10-12', end: '2026-12-11',
      meetingDay: 2, startTime: '18:15', endTime: '19:45', timeFormat: '24', timeLayout: 'inline',
    },
    columns: clone(DEFAULT_COLUMNS),
    categories: clone(DEFAULT_CATEGORIES),
    challenges: clone(DEFAULT_CHALLENGES),
    patrols: clone(DEFAULT_PATROLS),
    options: {
      highlight: 'date-activity', challengeDisplay: 'icon', weekPrefix: 'Week ', holidayLabel: 'Hols', dateFormat: 'short',
      paper: 'A4', orientation: 'landscape', margin: 8, autoFit: true, maxFont: 11, minFont: 6.5,
      stretch: true, showLegend: true, rotatePatrols: true, fitDescription: true, weekStart: 1, publicHolidays: true,
    },
    rows: [],
  };
  return s;
}

/** Merge a loaded/imported object over defaults so older files keep working. */
function normalise(raw) {
  const d = defaultState();
  if (!raw || typeof raw !== 'object') return d;
  const s = { ...d, ...raw };
  s.branding = { ...d.branding, ...(raw.branding || {}) };
  s.term = { ...d.term, ...(raw.term || {}) };
  s.options = { ...d.options, ...(raw.options || {}) };
  ['categories', 'challenges', 'patrols'].forEach((k) => { if (!Array.isArray(s[k])) s[k] = d[k]; });
  if (!Array.isArray(s.branding.leaders)) s.branding.leaders = [];
  // Columns: keep saved order/labels, add any new built-in columns.
  const saved = Array.isArray(raw.columns) ? raw.columns.filter((c) => DEFAULT_COLUMNS.some((dc) => dc.key === c.key)) : [];
  s.columns = saved.map((c) => ({ ...DEFAULT_COLUMNS.find((dc) => dc.key === c.key), ...c }));
  DEFAULT_COLUMNS.forEach((dc) => { if (!s.columns.some((c) => c.key === dc.key)) s.columns.push(clone(dc)); });
  if (OLD_SECTION_COLORS[s.branding.section] && s.branding.color?.toUpperCase() === OLD_SECTION_COLORS[s.branding.section]) {
    s.branding.color = SECTIONS[s.branding.section].color;
  }
  s.challenges.forEach((c) => { if (OLD_CHALLENGE_COLORS[c.id] && c.color?.toUpperCase() === OLD_CHALLENGE_COLORS[c.id]) c.color = DEFAULT_CHALLENGES.find((d) => d.id === c.id).color; });
  s.rows = Array.isArray(raw.rows) ? raw.rows.map((r) => ({ ...newRowShape(), ...r, id: r.id || uid() })) : [];
  return s;
}
function newRowShape() {
  return { id: '', date: '', endDate: '', dateLabel: '', time: '', activity: '', description: '', uniform: '', forms: '',
    where: '', patrol: '', leader: '', cost: '', challenge: '', notes: '', category: '', noMeeting: false, autoHoliday: false };
}

/* ---------------------------------------------------------------- saved programs */

function readJSON(key) { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } }

function save() {
  try {
    localStorage.setItem(programKey(library.current), JSON.stringify(state));
    const info = { id: library.current, name: titleText() || 'Untitled program', group: state.branding.groupName.trim(), updated: Date.now() };
    const i = library.items.findIndex((x) => x.id === library.current);
    if (i < 0) library.items.push(info); else library.items[i] = info;
    localStorage.setItem(LIB_KEY, JSON.stringify(library));
  } catch {
    toast('Could not save in this browser (storage full?). Use "Save file" to keep a copy.', 'error');
  }
}
const saveSoon = debounce(save, 400);

function freshState() {
  state = defaultState();
  state.rows = generateRows();
  return state;
}

/** Load the current program, moving an older single saved program into the library. */
function load() {
  const lib = readJSON(LIB_KEY);
  if (lib && Array.isArray(lib.items)) {
    library = { current: lib.current, items: lib.items.filter((x) => x && x.id) };
    const raw = library.current && readJSON(programKey(library.current));
    if (raw) return normalise(raw);
    const other = library.items.find((x) => readJSON(programKey(x.id)));
    if (other) { library.current = other.id; return normalise(readJSON(programKey(other.id))); }
  }
  library = { current: uid(), items: [] };
  const old = readJSON(STORE_KEY);
  state = old ? normalise(old) : freshState();
  save();
  if (old) { try { localStorage.removeItem(STORE_KEY); } catch { /* keep it */ } }
  return state;
}

/** Make `next` the open program (a new entry in the library), keeping the current one saved. */
function addProgram(next) {
  save();
  library.current = uid();
  state = next;
  undoStack = []; $('#btnUndo').disabled = true;
  save(); renderAll();
}

function openProgram(id) {
  if (id === library.current) return;
  const raw = readJSON(programKey(id));
  if (!raw) { toast('That program could not be found.', 'error'); return; }
  save();
  library.current = id;
  state = normalise(raw);
  undoStack = []; $('#btnUndo').disabled = true;
  save(); renderAll();
}

async function deleteProgram(id) {
  const item = library.items.find((x) => x.id === id);
  if (!item) return;
  const ok = await modal({
    title: 'Delete this program?',
    body: `<p><strong>${esc(item.name)}</strong>${item.group ? ` (${esc(item.group)})` : ''} will be removed from this browser. This can't be undone, so use <strong>Save file</strong> first if you might want it again.</p>`,
    buttons: [{ label: 'Cancel', value: false, cls: 'btn-text' }, { label: 'Delete', value: true, cls: 'btn-danger' }],
  });
  if (!ok) return;
  try { localStorage.removeItem(programKey(id)); } catch { /* ignore */ }
  library.items = library.items.filter((x) => x.id !== id);
  if (id === library.current) {
    const next = [...library.items].sort((a, b) => b.updated - a.updated)[0];
    if (next) { library.current = next.id; state = normalise(readJSON(programKey(next.id))); }
    else { library.current = uid(); freshState(); }
    undoStack = []; $('#btnUndo').disabled = true;
  }
  save(); renderAll();
  toast('Program deleted.');
}

/** A copy with new row ids, so two programs never share calendar event ids. */
function copyOf(s) {
  const c = clone(s);
  c.rows.forEach((r) => { r.id = uid(); });
  return c;
}

function relTime(ms) {
  const d = new Date(ms), now = new Date();
  const time = `${((d.getHours() + 11) % 12) + 1}:${String(d.getMinutes()).padStart(2, '0')} ${d.getHours() >= 12 ? 'pm' : 'am'}`;
  if (d.toDateString() === now.toDateString()) return `today ${time}`;
  return `${d.getDate()} ${MONTH_SHORT[d.getMonth()]}${d.getFullYear() !== now.getFullYear() ? ` ${d.getFullYear()}` : ''}`;
}

function openProgramsMenu(anchor) {
  save();
  const items = [...library.items].sort((a, b) => b.updated - a.updated);
  openPopover(anchor, `
    <div class="pop-title">Programs <span class="pop-sub">saved in this browser</span></div>
    <div class="prog-list">
      ${items.map((x) => `
        <div class="prog-item ${x.id === library.current ? 'on' : ''}">
          <button class="prog-open" data-open="${x.id}" ${x.id === library.current ? 'aria-current="true"' : ''}>
            <b>${esc(x.name)}</b>
            <span>${esc([x.group, `edited ${relTime(x.updated)}`].filter(Boolean).join(' · '))}${x.id === library.current ? ' · <em>open</em>' : ''}</span>
          </button>
          <button class="icon-btn" data-delprog="${x.id}" title="Delete" aria-label="Delete ${esc(x.name)}"><svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></svg></button>
        </div>`).join('')}
    </div>
    <div class="pop-actions">
      <button class="btn btn-text btn-sm" id="pDupProg">Duplicate this one</button>
      <button class="btn btn-primary btn-sm" id="pNewProg">New program</button>
    </div>`, { type: 'programs' });
  pop.querySelectorAll('[data-open]').forEach((b) => { b.onclick = () => { closePopover(); openProgram(b.dataset.open); }; });
  pop.querySelectorAll('[data-delprog]').forEach((b) => { b.onclick = () => { closePopover(); deleteProgram(b.dataset.delprog); }; });
  $('#pDupProg').onclick = () => {
    closePopover();
    const c = copyOf(state);
    c.branding.versionText = '';
    addProgram(c);
    toast('Copy made — you are now editing the copy.');
  };
  $('#pNewProg').onclick = () => { closePopover(); newProgram(); };
}

function pushHistory() {
  undoStack.push(JSON.stringify(state));
  if (undoStack.length > 60) undoStack.shift();
  $('#btnUndo').disabled = false;
}
function undo() {
  const prev = undoStack.pop();
  if (!prev) return;
  state = JSON.parse(prev);
  $('#btnUndo').disabled = undoStack.length === 0;
  save(); renderAll();
}

/* ---------------------------------------------------------------- dates */

function meetingDates() {
  const s = parseDate(state.term.start), e = parseDate(state.term.end);
  if (!s || !e || e < s) return [];
  const out = [];
  let d = addDays(s, (state.term.meetingDay - s.getDay() + 7) % 7);
  while (d <= e) { out.push(toISO(d)); d = addDays(d, 7); }
  return out;
}

/** Public holiday name on a date for the selected region (if enabled), else ''. */
function publicHoliday(iso) {
  const src = state.options.publicHolidays && PUBLIC_HOLIDAYS[state.term.region];
  const year = iso ? +iso.slice(0, 4) : 0;
  if (!src || !iso || year > src.to) return '';
  return src.fn(year)[iso] || '';
}

function weekOffText(reason) { return `No ${state.branding.sectionName || 'meeting'} – ${reason}`; }

/** A row nobody has typed into yet (as made by Generate dates). */
function isBlankRow(r) {
  return !r.noMeeting && !['activity', 'description', 'notes', 'leader', 'cost', 'where'].some((k) => (r[k] || '').trim())
    && !r.challenge && !r.category;
}

/**
 * One row per meeting night. Nights on a public holiday become weeks off and don't use up a
 * duty patrol turn. With `existing` rows, only missing dates are returned (and blank existing
 * rows on a public holiday are turned into weeks off).
 */
function generateRows(existing = []) {
  const usedDates = new Set(existing.map((r) => r.date));
  const patrols = state.patrols.filter((p) => p.name);
  let turn = 0;
  return meetingDates().map((date) => {
    const holiday = publicHoliday(date);
    if (holiday) {
      const blank = existing.find((r) => r.date === date && isBlankRow(r));
      if (blank) Object.assign(blank, { noMeeting: true, autoHoliday: true, activity: weekOffText(holiday) });
      if (usedDates.has(date)) return null;
      return newRow(date, { noMeeting: true, autoHoliday: true, activity: weekOffText(holiday), time: '', uniform: '' });
    }
    const patrol = state.options.rotatePatrols && patrols.length ? patrols[turn % patrols.length].name : '';
    turn++;
    if (usedDates.has(date)) return null;
    return newRow(date, { patrol });
  }).filter(Boolean);
}

/** First day of the week: 1 = weeks run Monday–Sunday, 0 = Sunday–Saturday. */
function weekStartDay() { return state.options.weekStart === 0 ? 0 : 1; }
function startOfWeek(d) { return addDays(d, -((d.getDay() - weekStartDay() + 7) % 7)); }

function weekOf(iso) {
  const d = parseDate(iso), s = parseDate(state.term.start), e = parseDate(state.term.end);
  if (!d || !s) return null;
  if (d < s || (e && d > e)) return null;
  return Math.floor(dayDiff(startOfWeek(s), d) / 7) + 1;
}

/** The first day of the week a row belongs to: its own date's week, else the week it sits in. */
function rowWeekStart(row) {
  const d = parseDate(row.date);
  if (d) return startOfWeek(d);
  const g = weekGroups().find((x) => x.rows.includes(row));
  const s = parseDate(state.term.start);
  if (g && typeof g.key === 'number' && s) return addDays(startOfWeek(s), (g.key - 1) * 7);
  const dated = g?.rows.find((r) => r.date);
  if (dated) return startOfWeek(parseDate(dated.date));
  return s ? startOfWeek(s) : null;
}

/** Minutes after midnight of the first time in a cell ("18:15", "6:30 PM", "9 AM"), or null. */
function startMinutes(text) {
  const m = /(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)?/i.exec(text || '');
  if (!m || (!m[2] && !m[3])) return null;
  let h = +m[1];
  const min = +(m[2] || 0);
  if (m[3]) { const pm = m[3].toLowerCase() === 'pm'; h = (h % 12) + (pm ? 12 : 0); }
  return h > 23 || min > 59 ? null : h * 60 + min;
}

/**
 * Keep rows in order: by date, then start time (rows without a time go last on their day).
 * Undated rows travel with the row above them. Ties keep their current order.
 */
function sortRows() {
  let last = '';
  const keyed = state.rows.map((r, i) => {
    if (r.date) last = r.date;
    const t = startMinutes(r.time);
    return { r, k: r.date || last, t: t ?? 24 * 60, i };
  });
  keyed.sort((a, b) => (a.k < b.k ? -1 : a.k > b.k ? 1 : a.t - b.t || a.i - b.i));
  state.rows = keyed.map((x) => x.r);
}

function applyTermPreset() {
  const t = state.term;
  const preset = TERM_DATES[t.region]?.[t.year]?.[t.term - 1];
  if (preset) { t.start = preset[0]; t.end = preset[1]; }
  return !!preset;
}

/** True once someone has entered anything (automatic public holiday rows don't count). */
function rowsHaveContent() {
  return state.rows.some((r) => !r.autoHoliday && !isBlankRow(r));
}

/* ---------------------------------------------------------------- sheet rendering */

/** Consecutive rows in the same term week (undated rows join the group above). */
function weekGroups() {
  const groups = [];
  let prevKey = Symbol('start');
  state.rows.forEach((r, i) => {
    const key = r.date ? (weekOf(r.date) ?? `out-${toISO(startOfWeek(parseDate(r.date)))}`) : prevKey;
    if (groups.length && key === prevKey) groups[groups.length - 1].rows.push(r);
    else groups.push({ key, start: i, rows: [r] });
    prevKey = key;
  });
  return groups;
}

function groupLabel(g) {
  return typeof g.key === 'number' ? `${state.options.weekPrefix || ''}${g.key}`.trim() : 'the next group';
}

/**
 * Where moving a row a week up (-1) or down (+1) would take it, or null if that week is
 * outside the term. Returns the target week's first day and its term week number.
 */
function movePlan(rowId, dir) {
  const row = rowById(rowId);
  const ws = row && rowWeekStart(row);
  const s = parseDate(state.term.start), e = parseDate(state.term.end);
  if (!ws || !s) return null;
  const target = addDays(ws, dir * 7);
  if (addDays(target, 6) < s || (e && target > e)) return null;
  return { target, wk: Math.floor(dayDiff(startOfWeek(s), target) / 7) + 1 };
}

/** Move a row a whole week, keeping its weekday (an undated row lands on the meeting night). */
function moveRow(rowId, dir) {
  const plan = movePlan(rowId, dir);
  if (!plan) return;
  const row = rowById(rowId);
  if (row.date) {
    row.date = toISO(addDays(parseDate(row.date), dir * 7));
    if (row.endDate) row.endDate = toISO(addDays(parseDate(row.endDate), dir * 7));
  } else {
    row.date = toISO(addDays(plan.target, (state.term.meetingDay - weekStartDay() + 7) % 7));
  }
}

function visibleColumns() { return state.columns.filter((c) => c.visible); }

function titleText() {
  const b = state.branding, t = state.term;
  return (b.titleTemplate || '')
    .replace(/\{section\}/gi, b.sectionName || '')
    .replace(/\{term\}/gi, t.term)
    .replace(/\{year\}/gi, t.year)
    .replace(/\{group\}/gi, b.groupName || '')
    .trim();
}

function groupNameHTML() {
  return esc(state.branding.groupName).replace(/\b(\d+)(st|nd|rd|th)\b/gi, '$1<sup>$2</sup>');
}

function logoHTML() {
  const b = state.branding;
  if (b.logo) return `<img src="${b.logo}" alt="">`;
  const official = SECTIONS[b.section]?.logo;
  if (official) return `<img src="${official}" alt="${esc(SECTIONS[b.section].name)} logo">`;
  return `<span class="logo-glyph" style="color:${esc(b.color)}">⚜</span>`;
}

function challengeHTML(id) {
  const c = state.challenges.find((x) => x.id === id);
  if (!c) return '';
  const mode = state.options.challengeDisplay;
  const official = CHALLENGE_ASSETS[c.id];
  let icon = '';
  let named = false;
  if (mode !== 'text') {
    if (c.icon) icon = `<img class="ch-icon" src="${c.icon}" alt="${esc(c.label)}">`;
    else if (official) {
      // The official "named" artwork already carries the name; only use it if the label is unchanged.
      named = mode === 'both' && c.label === official.label;
      icon = `<img class="ch-icon${named ? ' ch-named' : ''}" src="${named ? official.named : official.icon}" alt="${esc(c.label)}">`;
    } else {
      icon = `<svg class="ch-icon" viewBox="0 0 24 24" style="fill:none;stroke:${esc(c.color)};stroke-width:1.5" role="img" aria-label="${esc(c.label)}"><circle cx="12" cy="12" r="10.6"/>`
        + `<text x="12" y="15.6" text-anchor="middle" font-size="9" font-weight="700" style="fill:${esc(c.color)};stroke:none">${esc((c.label || '?')[0])}</text></svg>`;
    }
  }
  if (named) return `<span class="ch">${icon}</span>`;
  const label = mode !== 'icon' ? `<span class="ch-label" style="color:${esc(c.color)}">${esc(c.label)}</span>` : '';
  return `<span class="ch">${icon}${label}</span>`;
}

function patrolHTML(name) {
  if (!name) return '';
  const p = state.patrols.find((x) => x.name.toLowerCase() === name.toLowerCase());
  return `<span class="patrol" style="${p ? `color:${esc(p.color)}` : ''}">${esc(name)}</span>`;
}

function dateText(r, includeTime) {
  let txt;
  if (r.dateLabel) txt = r.dateLabel;
  else {
    txt = formatDate(r.date);
    if (r.endDate && r.endDate !== r.date) txt += `\n${formatDate(r.endDate)}`;
  }
  if (includeTime && r.time) txt += (txt ? '\n' : '') + r.time;
  return txt;
}

const HL_KEYS = { 'date-activity': ['date', 'time', 'activity'], activity: ['activity'] };

function cellHTML(col, r) {
  const k = col.key;
  const cat = state.categories.find((c) => c.id === r.category);
  const hl = state.options.highlight;
  const tint = cat && !r.noMeeting && (hl === 'row' || (HL_KEYS[hl] || []).includes(k)) ? ` style="background:${esc(cat.color)}"` : '';
  const align = ` data-align="${col.align || 'center'}"`;
  const timeHidden = !state.columns.find((c) => c.key === 'time')?.visible;

  if (k === 'date') {
    const txt = dateText(r, timeHidden && !r.noMeeting);
    return `<td class="c-date clickable" data-pop="date"${align}${tint}><div class="dt">${txt ? esc(txt) : '<span class="ph">Set date</span>'}</div></td>`;
  }
  if (k === 'challenge') return `<td class="c-challenge clickable" data-pop="challenge"${align}${tint}>${challengeHTML(r.challenge)}</td>`;
  if (k === 'patrol') return `<td class="c-patrol clickable" data-pop="patrol"${align}${tint}>${patrolHTML(r.patrol)}</td>`;
  if (k === 'leader') {
    return `<td class="c-leader clickable" data-pop="leader"${align}${tint}>${r.leader ? `<span class="pick">${esc(r.leader)}</span>` : '<span class="ph">Leader</span>'}</td>`;
  }
  const ph = { activity: 'Activity', description: 'Add a description' }[k] || '';
  return `<td class="c-${k}"${align}${tint}><div class="ed" contenteditable="plaintext-only" spellcheck="true" data-key="${k}"${ph ? ` data-ph="${ph}"` : ''}>${esc(r[k])}</div></td>`;
}

function renderSheet() {
  const b = state.branding, o = state.options;
  const sheet = $('#sheet');
  const cols = visibleColumns();
  const totalW = cols.reduce((a, c) => a + (+c.width || 1), 0) || 1;

  const accent = b.color || '#4f2d7f';
  const headBg = b.headerStyle === 'solid' ? accent
    : b.headerStyle === 'grey' ? '#e6e6e6'
      : `color-mix(in srgb, ${accent} 42%, white)`;
  const headFg = b.headerStyle === 'solid' ? readableOn(accent) : '#1d1d1f';
  const titleColor = b.titleColor === 'auto' && luminance(accent) < 0.45 ? accent : '#1d1d1f';
  sheet.style.setProperty('--accent', accent);
  sheet.style.setProperty('--head-bg', headBg);
  sheet.style.setProperty('--head-fg', headFg);
  sheet.style.setProperty('--title', titleColor);
  sheet.style.setProperty('--doc-font', b.font === 'Arial' ? 'Arial, Helvetica, sans-serif' : `'${b.font}', Arial, sans-serif`);
  sheet.style.setProperty('--hfs', `${Math.max(9, o.maxFont)}pt`);

  const leaders = b.leaders.filter((l) => l.name || l.phone);
  const lCols = leaders.length > 8 ? 3 : leaders.length > 4 ? 2 : 1;
  const leadersHTML = leaders.length ? `
    <div class="doc-leaders">
      ${b.leadersLabel ? `<div class="doc-leaders-label">${esc(b.leadersLabel)}</div>` : ''}
      <div class="doc-leaders-grid" style="grid-template-columns:repeat(${lCols}, auto auto);">
        ${leaders.map((l) => `<span class="l-name">${esc(l.name)}</span><span class="l-phone">${esc(l.phone)}</span>`).join('')}
      </div>
    </div>` : '';

  const usedCats = state.categories.filter((c) => c.label);
  const legendHTML = o.showLegend && usedCats.length
    ? `<div class="doc-legend">${usedCats.map((c) => `<span style="background:${esc(c.color)}">${esc(c.label)}</span>`).join('')}</div>` : '';

  const groups = weekGroups();

  const body = groups.map((g) => g.rows.map((r, i) => {
    const cat = state.categories.find((c) => c.id === r.category);
    const spanCols = cols.filter((c) => c.key !== 'week' && c.key !== 'date').length;
    let spanned = false;
    const cells = cols.map((c) => {
      if (r.noMeeting && c.key !== 'week' && c.key !== 'date') {
        if (spanned) return '';
        spanned = true;
        return `<td class="c-break" colspan="${spanCols}" data-align="center"><div class="ed" contenteditable="plaintext-only" spellcheck="true" data-key="activity" data-ph="No meeting">${esc(r.activity)}</div></td>`;
      }
      if (c.key !== 'week') return cellHTML(c, r);
      if (i > 0) return '';
      const label = typeof g.key === 'number' ? `${o.weekPrefix || ''}${g.key}` : (o.holidayLabel || '–');
      const tint = cat && !r.noMeeting && o.highlight === 'row' && g.rows.length === 1 ? ` style="background:${esc(cat.color)}"` : '';
      return `<td class="c-week" rowspan="${g.rows.length}"${tint}><span class="wk">${esc(label)}</span></td>`;
    }).join('');
    const cls = [r.noMeeting && 'no-meeting', i > 0 && cols[0]?.key === 'week' && 'cont'].filter(Boolean).join(' ');
    return `<tr data-id="${r.id}"${cls ? ` class="${cls}"` : ''}>${cells}</tr>`;
  }).join('')).join('');

  sheet.innerHTML = `
    <div class="doc-header">
      <div class="doc-logo">${logoHTML()}</div>
      <div class="doc-titles">
        <div class="doc-group">${state.branding.groupName.trim() ? groupNameHTML() : '<span class="ph">Your Scout Group</span>'}</div>
        <div class="doc-title">${esc(titleText())}</div>
      </div>
      <div class="doc-side">
        ${leadersHTML}
        ${b.versionText ? `<div class="doc-version">${esc(b.versionText)}</div>` : ''}
      </div>
    </div>
    ${legendHTML}
    <table class="prog">
      <colgroup>${cols.map((c) => `<col data-key="${c.key}" data-pct="${((+c.width || 1) / totalW) * 100}" style="width:${((+c.width || 1) / totalW) * 100}%">`).join('')}</colgroup>
      <thead><tr>${cols.map((c) => `<th class="c-${c.key}"><span class="th-l">${esc(c.label)}</span></th>`).join('')}</tr></thead>
      <tbody>${body || `<tr class="empty-row"><td colspan="${cols.length}">No activities yet — use <b>Generate dates</b> or <b>Add activity</b>.</td></tr>`}</tbody>
    </table>
    ${b.footerText ? `<div class="doc-footer">${esc(b.footerText)}</div>` : ''}`;
}

/* ---------------------------------------------------------------- page size / fit */

function paperDims() {
  const [w, h] = PAPER_MM[state.options.paper] || PAPER_MM.A4;
  return state.options.orientation === 'portrait' ? [Math.min(w, h), Math.max(w, h)] : [Math.max(w, h), Math.min(w, h)];
}

function applyPageSize() {
  const [w, h] = paperDims();
  const m = Math.min(25, Math.max(4, +state.options.margin || 8));
  const paper = $('#paper');
  paper.style.setProperty('--paper-w', `${w}mm`);
  paper.style.setProperty('--paper-h', `${h}mm`);
  paper.style.setProperty('--margin', `${m}mm`);
  $('#pageStyle').textContent =
    `@page { size: ${state.options.paper === 'Letter' ? 'letter' : 'A4'} ${state.options.orientation}; margin: ${m}mm; }`;
}

/**
 * Widen columns whose longest word (or heading, week label, icon) doesn't fit, taking the room
 * from columns with space to spare in proportion to it. The widths set in the sidebar are the
 * starting point; text is only shrunk later if borrowing isn't enough.
 */
function fitColumns(sheet) {
  const table = $('.prog', sheet);
  if (!table) return;
  const cols = $$('col', table);
  cols.forEach((c) => { c.style.width = `${c.dataset.pct}%`; });
  $$('.prog .ed, .prog .dt, .prog .patrol, .prog .pick, .prog th, .prog .c-week', sheet).forEach((el) => { el.style.fontSize = ''; });

  // Measure every column's narrowest possible content (its longest unbreakable piece). The
  // "preferred" pass also keeps week labels and date lines on one line.
  const measure = (cls) => {
    sheet.classList.add('measuring', ...(cls ? [cls] : []));
    const need = {};
    $$('.prog th, .prog td', sheet).forEach((cell) => {
      const key = [...cell.classList].find((c) => c.startsWith('c-'))?.slice(2);
      const content = cell.firstElementChild;
      if (!key || !content || content.classList.contains('ph')) return;   // screen-only prompts
      const cs = getComputedStyle(cell);
      const w = content.offsetWidth + parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight) + 1.5;
      need[key] = Math.max(need[key] || 0, w);
    });
    sheet.classList.remove('measuring', ...(cls ? [cls] : []));
    return need;
  };
  const total = table.clientWidth;
  const base = cols.map((c) => ({ c, cur: (parseFloat(c.dataset.pct) / 100) * total }));

  // Give each column at least `need`, taking the room from columns with spare, in proportion.
  const solve = (need) => {
    const items = base.map((b) => ({ ...b, min: need[b.c.dataset.key] || 0 }));
    const deficit = items.reduce((a, it) => a + Math.max(0, it.min - it.cur), 0);
    const slack = items.reduce((a, it) => a + Math.max(0, it.cur - it.min), 0);
    const take = Math.min(1, slack > 0 ? deficit / slack : 0);
    items.forEach((it) => { it.w = it.cur < it.min ? it.min : it.cur - (it.cur - it.min) * take; });
    return { items, deficit, fits: deficit <= slack };
  };

  // Prefer week labels and dates on one line; let them wrap ("Week / 1", "Tue / 2 Feb") only if needed.
  let plan = solve(measure('measure-oneline'));
  if (!plan.fits) plan = solve(measure());
  if (plan.deficit < 0.5) return;
  // If there wasn't enough spare room, scale everything back to the table width (text shrinks after).
  const sum = plan.items.reduce((a, it) => a + it.w, 0);
  plan.items.forEach((it) => { it.c.style.width = `${(it.w / sum) * 100}%`; });
}

/** True when a block's text fits its width without any word sticking out. */
function widthOk(el) {
  if (el.classList.contains('patrol') || el.classList.contains('pick')) return overflowsNot(el);
  return el.scrollWidth <= el.clientWidth + 0.5;
}

/**
 * Size each body cell's text on its own, never smaller than 70% of the table text (or 6pt):
 *  - no cell may break a word, so a cell whose longest word doesn't fit is shrunk;
 *  - each Description is also shrunk to stay within two lines, or the tallest other cell in its row.
 * Cells are sized together in a few rounds so the table is laid out once per round.
 * Returns false if some word still doesn't fit at the smallest size (the table must shrink).
 */
function fitCells(sheet, fs) {
  const all = $$('.prog tbody .ed, .prog tbody .dt, .prog tbody .patrol, .prog tbody .pick', sheet);
  all.forEach((el) => { el.style.fontSize = ''; });
  if (!all.length) return true;
  const minPt = Math.min(fs, Math.max(6, fs * 0.7));
  const shrinkDesc = state.options.fitDescription;
  const isDesc = (el) => el.dataset.key === 'description';

  const size = (items) => {
    const ok = (it) => widthOk(it.el) && (!it.target || it.el.offsetHeight <= it.target);
    const need = items.filter((it) => !ok(it));
    need.forEach((it) => { it.lo = minPt; it.hi = fs; it.best = null; });
    for (let round = 0; round < 6 && need.length; round++) {
      need.forEach((it) => { it.mid = (it.lo + it.hi) / 2; it.el.style.fontSize = `${it.mid}pt`; });
      need.forEach((it) => { if (ok(it)) { it.best = it.mid; it.lo = it.mid; } else it.hi = it.mid; });
    }
    need.forEach((it) => { it.el.style.fontSize = `${Math.floor((it.best ?? minPt) * 10) / 10}pt`; });
    return need.every((it) => it.best !== null || widthOk(it.el));
  };

  // Everything except descriptions first, so descriptions can match the settled row heights.
  const okOthers = size(all.filter((el) => !isDesc(el)).map((el) => ({ el })));
  const descs = all.filter(isDesc);
  let twoLines = 0;
  if (descs.length) twoLines = 2 * parseFloat(getComputedStyle(descs[0]).lineHeight) + 1;
  const okDescs = size(descs.map((el) => {
    if (!shrinkDesc) return { el };
    let target = twoLines;
    el.closest('tr').querySelectorAll('td:not(.c-description):not(.c-week)').forEach((td) => {
      const c = td.firstElementChild;
      if (c) target = Math.max(target, c.offsetHeight + 1);
    });
    return { el, target };
  }));
  return okOthers && okDescs;
}

/** True when an inline-block label fits inside its cell's content box. */
function overflowsNot(el) {
  const td = el.parentElement, cs = getComputedStyle(td);
  return el.offsetWidth <= td.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) + 0.5;
}

/**
 * Shrink a set of cells together (headings, or week labels) on their own, down to `minScale`,
 * until every label inside fits its cell's width. Keeps them one consistent size.
 */
function fitLabels(cells, labelSel, minScale) {
  if (!cells.length) return;
  cells.forEach((c) => { c.style.fontSize = ''; });
  const labels = cells.map((c) => c.querySelector(labelSel)).filter(Boolean);
  if (labels.every(overflowsNot)) return;
  const setScale = (s) => cells.forEach((c) => { c.style.fontSize = `${s}em`; });
  let lo = minScale, hi = 1, best = minScale;
  for (let i = 0; i < 6; i++) {
    const mid = (lo + hi) / 2;
    setScale(mid);
    if (labels.every(overflowsNot)) { best = mid; lo = mid; } else hi = mid;
  }
  setScale(Math.floor(best * 100) / 100);
}

function fit() {
  const sheet = $('#sheet');
  const o = state.options;
  const table = $('.prog', sheet);
  const status = $('#fitStatus');
  sheet.classList.remove('multi');
  if (table) table.style.height = '';
  let cellsOk = true;
  const setFs = (pt) => {
    sheet.style.setProperty('--fs', `${pt}pt`);
    fitColumns(sheet);
    fitLabels($$('.prog thead th', sheet), '.th-l', 0.7);
    fitLabels($$('.prog tbody .c-week', sheet), '.wk', 0.75);
    cellsOk = fitCells(sheet, pt);
  };
  // No word may ever break: labels and cells must fit their column's width at the current size.
  const widthsOk = () => cellsOk && $$('.c-week .wk, thead .th-l', sheet).every(overflowsNot);
  const fits = () => sheet.scrollHeight <= sheet.clientHeight + 1 && widthsOk();

  const max = Math.max(5, +o.maxFont || 11);
  const min = Math.min(max, Math.max(4, +o.minFont || 6.5));
  let fs = max;
  setFs(max);
  if (!fits() && o.autoFit) {
    setFs(min);
    if (fits()) {
      let lo = min, hi = max;
      for (let i = 0; i < 9; i++) {
        const mid = (lo + hi) / 2;
        setFs(mid);
        if (fits()) lo = mid; else hi = mid;
      }
      fs = Math.floor(lo * 10) / 10;
      setFs(fs);
    } else {
      // Won't fit one page even at the smallest size: keep it readable over several pages.
      fs = max; setFs(max);
      if (!widthsOk()) {
        let lo = min, hi = max;
        for (let i = 0; i < 9; i++) { const mid = (lo + hi) / 2; setFs(mid); if (widthsOk()) lo = mid; else hi = mid; }
        fs = Math.floor(lo * 10) / 10; setFs(fs);
      }
    }
  }

  const one = sheet.scrollHeight <= sheet.clientHeight + 1;
  if (one && o.stretch && table && state.rows.length) {
    const last = sheet.lastElementChild;
    const spare = (sheet.offsetTop + sheet.clientHeight) - (last.offsetTop + last.offsetHeight);
    const grow = Math.min(spare - 6, table.offsetHeight * 0.6);
    if (grow > 4) table.style.height = `${table.offsetHeight + grow}px`;
  }

  const guides = $('#pageGuides');
  guides.innerHTML = '';
  if (!one) {
    const pageH = sheet.clientHeight;
    sheet.classList.add('multi');
    const pages = Math.max(2, Math.ceil(sheet.scrollHeight / pageH));
    for (let p = 1; p < pages; p++) {
      const g = document.createElement('div');
      g.className = 'page-guide';
      g.style.top = `calc(var(--margin) + ${p * pageH}px)`;
      g.innerHTML = `<span>Page ${p + 1} (approx.)</span>`;
      guides.appendChild(g);
    }
    status.className = 'chip warn';
    status.textContent = `${pages} pages · ${fs}pt`;
    status.title = o.autoFit ? 'Too much content to fit one page at the smallest text size. Trim text, hide columns or lower the smallest text size.' : 'Turn on "Shrink text to fit" to fit one page.';
  } else {
    status.className = 'chip ok';
    status.textContent = `Fits 1 page · ${fs}pt`;
    status.title = '';
  }
  applyZoom();
}
const fitSoon = debounce(fit, 120);

function applyZoom() {
  const paper = $('#paper'), wrap = $('#paperWrap'), canvas = $('#canvas');
  const w = paper.offsetWidth, h = paper.offsetHeight;
  const s = zoom === 'fit' ? Math.max(0.4, Math.min(1.5, (canvas.clientWidth - 96) / w)) : +zoom;
  paper.style.transform = `scale(${s})`;
  wrap.style.width = `${w * s}px`;
  wrap.style.height = `${h * s}px`;
}

/* ---------------------------------------------------------------- sidebar */

function ensureYearOption() {
  const ys = $('#yearSelect');
  if (![...ys.options].some((o) => +o.value === state.term.year)) {
    const opt = new Option(state.term.year, state.term.year);
    const after = [...ys.options].find((o) => +o.value > state.term.year);
    ys.insertBefore(opt, after || null);
  }
}

function syncInputs() {
  ensureYearOption();
  $$('[data-bind]').forEach((el) => {
    const v = getPath(state, el.dataset.bind);
    if (el === document.activeElement) return;
    if (el.type === 'checkbox') el.checked = !!v;
    else el.value = v ?? '';
  });
  const t = state.term;
  const hasPreset = !!TERM_DATES[t.region]?.[t.year]?.[t.term - 1];
  const n = meetingDates().length;
  const hols = meetingDates().map((d) => [d, publicHoliday(d)]).filter(([, h]) => h);
  const holText = hols.length ? ` ${hols.map(([d, h]) => `${h} (${formatDate(d)})`).join(', ')} ${hols.length === 1 ? 'is a public holiday' : 'are public holidays'}.` : '';
  const src = PUBLIC_HOLIDAYS[t.region];
  const noHols = state.options.publicHolidays && t.region !== 'custom' && (!src || t.year > src.to) ? ' Public holidays aren’t built in for this year, so add any as weeks off.' : '';
  $('#termHint').textContent = `${t.region === 'custom' || !hasPreset ? 'Enter term dates above. ' : ''}${n} ${DAY_LONG[t.meetingDay]} meeting${n === 1 ? '' : 's'} this term.${holText}${noHols}`;
  $('#logoPreview').innerHTML = logoHTML();
}

function colorInput(list, i, field, value) {
  return `<input type="color" value="${esc(value)}" data-list="${list}" data-i="${i}" data-field="${field}" title="Colour">`;
}
const delBtn = (list, i) => `<button class="icon-btn" data-del="${list}" data-i="${i}" title="Remove" aria-label="Remove"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button>`;

function renderLists() {
  const b = state.branding;
  $('#leadersList').innerHTML = b.leaders.map((l, i) => `
    <div class="list-row">
      <input type="text" placeholder="Name" value="${esc(l.name)}" data-list="leaders" data-i="${i}" data-field="name">
      <input type="text" placeholder="Phone" value="${esc(l.phone)}" data-list="leaders" data-i="${i}" data-field="phone">
      ${delBtn('leaders', i)}
    </div>`).join('') || '<p class="hint">No leaders listed.</p>';

  $('#columnsList').innerHTML = state.columns.map((c, i) => `
    <div class="list-row col-row ${c.visible ? '' : 'off'}">
      <input type="checkbox" ${c.visible ? 'checked' : ''} data-list="columns" data-i="${i}" data-field="visible" title="Show column">
      <input type="text" value="${esc(c.label)}" data-list="columns" data-i="${i}" data-field="label">
      <input type="number" min="1" max="60" value="${esc(c.width)}" data-list="columns" data-i="${i}" data-field="width" title="Relative width" class="w-num">
      <button class="icon-btn" data-align="${i}" title="Text alignment: ${c.align}" aria-label="Toggle alignment">
        <svg viewBox="0 0 24 24">${c.align === 'left' ? '<path d="M4 6h16M4 10h10M4 14h16M4 18h10"/>' : '<path d="M4 6h16M7 10h10M4 14h16M7 18h10"/>'}</svg></button>
      <span class="move">
        <button class="icon-btn" data-move-col="${i}" data-dir="-1" ${i === 0 ? 'disabled' : ''} aria-label="Move up"><svg viewBox="0 0 24 24"><path d="m6 15 6-6 6 6"/></svg></button>
        <button class="icon-btn" data-move-col="${i}" data-dir="1" ${i === state.columns.length - 1 ? 'disabled' : ''} aria-label="Move down"><svg viewBox="0 0 24 24"><path d="m6 9 6 6 6-6"/></svg></button>
      </span>
    </div>`).join('');

  $('#challengesList').innerHTML = state.challenges.map((c, i) => `
    <div class="list-row">
      ${colorInput('challenges', i, 'color', c.color)}
      <span class="ch-preview">${challengeIconOnly(c)}</span>
      <input type="text" value="${esc(c.label)}" data-list="challenges" data-i="${i}" data-field="label">
      <button class="btn btn-text btn-xs" data-icon="${i}" title="${c.icon ? 'Go back to the default icon' : 'Upload your own icon'}">${c.icon ? 'Reset icon' : 'Icon…'}</button>
      ${delBtn('challenges', i)}
    </div>`).join('');

  $('#patrolsList').innerHTML = state.patrols.map((p, i) => `
    <div class="list-row">
      ${colorInput('patrols', i, 'color', p.color)}
      <input type="text" value="${esc(p.name)}" placeholder="Patrol name" data-list="patrols" data-i="${i}" data-field="name">
      ${delBtn('patrols', i)}
    </div>`).join('') || '<p class="hint">No patrols.</p>';

  $('#categoriesList').innerHTML = state.categories.map((c, i) => `
    <div class="list-row">
      ${colorInput('categories', i, 'color', c.color)}
      <input type="text" value="${esc(c.label)}" data-list="categories" data-i="${i}" data-field="label">
      ${delBtn('categories', i)}
    </div>`).join('') || '<p class="hint">No highlight colours.</p>';
}

function challengeIconOnly(c) {
  const saved = state.options.challengeDisplay;
  state.options.challengeDisplay = 'icon';
  const html = challengeHTML(c.id);
  state.options.challengeDisplay = saved;
  return html;
}

function renderAll() {
  sortRows();
  applyPageSize();
  syncInputs();
  renderLists();
  renderSheet();
  fit();
}
function renderDoc() { sortRows(); applyPageSize(); renderSheet(); fit(); }

/* ---------------------------------------------------------------- popovers */

const pop = $('#popover');
let popCtx = null;

function openPopover(anchor, html, ctx) {
  pop.onclick = null;
  pop.innerHTML = html;
  pop.hidden = false;
  popCtx = ctx;
  const r = anchor.getBoundingClientRect();
  const pw = pop.offsetWidth, ph = pop.offsetHeight;
  let left = Math.min(r.left, window.innerWidth - pw - 12);
  let top = r.bottom + 6;
  if (top + ph > window.innerHeight - 12) top = Math.max(12, r.top - ph - 6);
  pop.style.left = `${Math.max(12, left)}px`;
  pop.style.top = `${top}px`;
  $('input, button', pop)?.focus();
}
function closePopover() { pop.hidden = true; pop.onclick = null; popCtx = null; }

function rowById(id) { return state.rows.find((r) => r.id === id); }

function openDatePopover(td, row) {
  const ws = rowWeekStart(row);
  const days = ws ? Array.from({ length: 7 }, (_, i) => addDays(ws, i)) : [];
  const wk = ws ? weekOf(toISO(ws)) ?? weekOf(toISO(addDays(ws, 6))) : null;
  const range = days.length ? `${days[0].getDate()} ${MONTH_SHORT[days[0].getMonth()]} – ${days[6].getDate()} ${MONTH_SHORT[days[6].getMonth()]}` : '';
  openPopover(td, `
    <div class="pop-title">Date${days.length ? ` <span class="pop-sub">${wk ? `${esc(groupLabel({ key: wk }))} · ` : ''}${range}</span>` : ''}</div>
    ${days.length ? `<div class="days">${days.map((d) => {
      const iso = toISO(d);
      return `<button class="day ${iso === row.date ? 'on' : ''}" data-date="${iso}" title="${DAY_LONG[d.getDay()]} ${d.getDate()} ${MONTH_LONG[d.getMonth()]}"><b>${DAY_SHORT[d.getDay()]}</b><span>${d.getDate()}</span></button>`;
    }).join('')}</div>` : ''}
    <label class="field"><span>Date</span><input type="date" id="pDate" value="${esc(row.date)}"></label>
    <label class="field"><span>Ends (multi-day, optional)</span><input type="date" id="pEnd" value="${esc(row.endDate)}"></label>
    <label class="field"><span>Custom text (replaces date)</span><input type="text" id="pLabel" value="${esc(row.dateLabel)}" placeholder="e.g. Sat or Sun 7 or 8 Nov"></label>
    <div class="pop-actions"><button class="btn btn-text btn-sm" id="pClear">Clear</button><button class="btn btn-primary btn-sm" id="pDone">Done</button></div>`,
  { type: 'date', id: row.id });
  pushHistory();
  const apply = () => {
    const r = rowById(row.id); if (!r) return;
    r.date = $('#pDate').value; r.endDate = $('#pEnd').value; r.dateLabel = $('#pLabel').value;
    saveSoon(); renderDoc();
  };
  ['#pDate', '#pEnd', '#pLabel'].forEach((s) => $(s).addEventListener('input', apply));
  $('#pLabel').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#pDone').click(); });
  $('#pClear').onclick = () => { $('#pDate').value = ''; $('#pEnd').value = ''; $('#pLabel').value = ''; apply(); };
  $('#pDone').onclick = () => { closePopover(); sortRows(); save(); renderDoc(); };
  pop.querySelectorAll('.day').forEach((b) => {
    b.onclick = () => {
      const r = rowById(row.id); if (!r) return;
      const old = parseDate(r.date), next = b.dataset.date;
      // A multi-day activity keeps its length.
      if (r.endDate && old) r.endDate = toISO(addDays(parseDate(r.endDate), dayDiff(old, parseDate(next))));
      r.date = next;
      r.dateLabel = '';
      closePopover(); sortRows(); save(); renderDoc();
    };
  });
}

/** The section's leaders (from the Leaders list), then other leaders already used in this program. */
function leaderChoices() {
  const section = [...new Set(state.branding.leaders.map((l) => l.name.trim()).filter(Boolean))];
  const others = [...new Set(state.rows.map((r) => (r.leader || '').trim()).filter((n) => n && !section.includes(n)))].sort();
  return { section, others };
}

function openLeaderPopover(td, row) {
  const { section, others } = leaderChoices();
  const btn = (name) => `<button class="choice ${row.leader === name ? 'on' : ''}" data-v="${esc(name)}"><span class="dot person"></span><span>${esc(name)}</span></button>`;
  openPopover(td, `
    <div class="pop-title">Leader</div>
    <div class="choice-list">
      ${section.length ? section.map(btn).join('') : '<p class="hint">Add your section\'s leaders under <strong>Leaders</strong> in the sidebar.</p>'}
      ${others.length ? `<div class="menu-label">Other leaders in this program</div>${others.map(btn).join('')}` : ''}
      <button class="choice ${row.leader ? '' : 'on'}" data-v=""><span class="dot none"></span><span>None</span></button>
    </div>
    <label class="field"><span>Other leader</span>
      <span class="inline-add"><input type="text" id="pLeader" placeholder="e.g. Roo (Joeys)" value="${esc(section.includes(row.leader) || others.includes(row.leader) ? '' : row.leader)}"><button class="btn btn-primary btn-sm" id="pLeaderSet">Set</button></span>
    </label>`, { type: 'leader', id: row.id });
  const set = (v) => { pushHistory(); const r = rowById(row.id); if (r) r.leader = v; closePopover(); save(); renderDoc(); };
  pop.querySelectorAll('.choice').forEach((b) => { b.onclick = () => set(b.dataset.v); });
  const input = $('#pLeader');
  $('#pLeaderSet').onclick = () => { if (input.value.trim()) set(input.value.trim()); };
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && input.value.trim()) set(input.value.trim()); });
}

function openChoicePopover(td, row, key) {
  const items = key === 'challenge'
    ? state.challenges.map((c) => ({ value: c.id, html: `${challengeIconOnly(c)}<span>${esc(c.label)}</span>` }))
    : state.patrols.map((p) => ({ value: p.name, html: `<span class="dot" style="background:${esc(p.color)}"></span><span>${esc(p.name)}</span>` }));
  openPopover(td, `
    <div class="pop-title">${key === 'challenge' ? 'Challenge area' : 'Duty patrol'}</div>
    <div class="choice-list">
      ${items.map((it) => `<button class="choice ${row[key] === it.value ? 'on' : ''}" data-v="${esc(it.value)}">${it.html}</button>`).join('')}
      <button class="choice ${row[key] ? '' : 'on'}" data-v=""><span class="dot none"></span><span>None</span></button>
    </div>
    ${key === 'patrol' ? `<label class="field"><span>Or type</span><input type="text" id="pText" value="${esc(row.patrol)}" placeholder="e.g. All, Leaders"></label>` : ''}`,
  { type: key, id: row.id });
  const set = (v) => { pushHistory(); const r = rowById(row.id); if (r) r[key] = v; save(); renderDoc(); };
  pop.querySelectorAll('.choice').forEach((b) => { b.onclick = () => { set(b.dataset.v); closePopover(); }; });
  const t = $('#pText');
  if (t) t.addEventListener('keydown', (e) => { if (e.key === 'Enter') { set(t.value.trim()); closePopover(); } });
}

function openRowMenu(anchor, rowId) {
  const r = rowById(rowId); if (!r) return;
  const up = movePlan(rowId, -1), down = movePlan(rowId, 1);
  const moveLabel = (plan, word) => (plan ? `Move to ${esc(groupLabel({ key: plan.wk }))}` : `Move ${word} a week`);
  const icon = (d) => `<svg viewBox="0 0 24 24">${d}</svg>`;
  openPopover(anchor, `
    <div class="menu">
      <button data-act="below">${icon('<path d="M12 5v14M5 12h14"/>')}Add activity below <small>same date</small></button>
      <button data-act="above">${icon('<path d="M12 5v14M5 12h14"/>')}Add activity above</button>
      <button data-act="break">${icon(r.noMeeting ? '<path d="M3 12h4l3-8 4 16 3-8h4"/>' : '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M9 14l6 5M15 14l-6 5"/>')}${r.noMeeting ? 'Turn back into an activity' : 'Mark as no meeting'}</button>
      <button data-act="dup">${icon('<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>')}Duplicate</button>
      <button data-act="up" ${up ? '' : 'disabled'}>${icon('<path d="m6 15 6-6 6 6"/>')}${moveLabel(up, 'up')}</button>
      <button data-act="down" ${down ? '' : 'disabled'}>${icon('<path d="m6 9 6 6 6-6"/>')}${moveLabel(down, 'down')}</button>
      <div class="menu-sep"></div>
      <div class="menu-label">Highlight</div>
      <div class="swatches">
        ${state.categories.map((c) => `<button class="swatch ${r.category === c.id ? 'on' : ''}" data-cat="${c.id}" style="background:${esc(c.color)}" title="${esc(c.label)}"><span>${esc(c.label)}</span></button>`).join('')}
        <button class="swatch none ${r.category ? '' : 'on'}" data-cat="" title="No highlight"><span>None</span></button>
      </div>
      <div class="menu-sep"></div>
      <button data-act="del" class="danger">${icon('<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>')}Delete</button>
    </div>`, { type: 'row', id: rowId });

  pop.onclick = (e) => {
    const btn = e.target.closest('[data-act],[data-cat]');
    if (!btn || btn.disabled) return;
    pushHistory();
    const i = state.rows.findIndex((x) => x.id === rowId);
    const row = state.rows[i];
    if (btn.dataset.cat !== undefined) row.category = btn.dataset.cat;
    else {
      switch (btn.dataset.act) {
        case 'below': state.rows.splice(i + 1, 0, newRow(row.date, { uniform: row.uniform })); break;
        case 'above': state.rows.splice(i, 0, newRow(row.date, { uniform: row.uniform })); break;
        case 'dup': state.rows.splice(i + 1, 0, { ...clone(row), id: uid() }); break;
        case 'break':
          row.noMeeting = !row.noMeeting;
          row.autoHoliday = false;
          if (row.noMeeting && !row.activity.trim()) row.activity = `No ${state.branding.sectionName || 'meeting'} this week`;
          break;
        case 'up': moveRow(rowId, -1); break;
        case 'down': moveRow(rowId, 1); break;
        case 'del': state.rows.splice(i, 1); toast('Row deleted — Undo to restore.'); break;
        default: break;
      }
    }
    pop.onclick = null;
    closePopover(); hideHandle();
    save(); renderDoc();
  };
}

document.addEventListener('mousedown', (e) => {
  if (!pop.hidden && !pop.contains(e.target) && !e.target.closest('#rowHandle')) {
    if (popCtx?.type === 'date') { sortRows(); save(); renderDoc(); }
    pop.onclick = null;
    closePopover();
  }
});

/* ---------------------------------------------------------------- row handle */

const handle = $('#rowHandle');
let handleRow = null;
function showHandle(tr) {
  handleRow = tr.dataset.id;
  // Anchor to this row's own first cell (normally Date), not the merged Week cell, so the
  // mouse never has to cross another row's cell to reach the handle.
  const cell = tr.querySelector('td:not(.c-week)') || tr.firstElementChild;
  const r = cell.getBoundingClientRect();
  handle.hidden = false;
  handle.style.top = `${r.top + r.height / 2 - handle.offsetHeight / 2}px`;
  handle.style.left = `${r.left - handle.offsetWidth / 2}px`;
}
function hideHandle() { handle.hidden = true; handleRow = null; }

/* ---------------------------------------------------------------- actions */

async function generateDates() {
  const dates = meetingDates();
  if (!dates.length) { toast('Check the term start/end dates first.', 'error'); return; }
  let mode = 'replace';
  if (state.rows.length && rowsHaveContent()) {
    mode = await modal({
      title: 'Generate meeting dates',
      body: `<p>Your program already has activities. Add rows for any ${esc(DAY_LONG[state.term.meetingDay])} meeting dates that are missing, or start again with ${dates.length} empty weeks?</p>`,
      buttons: [{ label: 'Cancel', value: null, cls: 'btn-text' }, { label: 'Replace everything', value: 'replace', cls: 'btn-outline danger' }, { label: 'Add missing dates', value: 'merge', cls: 'btn-primary' }],
    });
    if (!mode) return;
  }
  pushHistory();
  if (mode === 'replace') state.rows = generateRows();
  else { state.rows = state.rows.concat(generateRows(state.rows)); sortRows(); }
  save(); renderDoc();
  toast(mode === 'replace' ? `Created ${state.rows.length} meeting rows.` : 'Missing dates added.');
}

function addActivity() {
  pushHistory();
  const dates = meetingDates();
  const last = [...state.rows].reverse().find((r) => r.date)?.date || '';
  const next = dates.find((d) => d > last) || last;
  state.rows.push(newRow(next));
  save(); renderDoc();
  const tr = $(`tr[data-id="${state.rows[state.rows.length - 1].id}"] .ed[data-key="activity"]`);
  tr?.focus();
}

/** Toolbar: add a week with no section night (public holiday, school holidays, …). */
function openBreakPopover(anchor) {
  const used = new Set(state.rows.map((r) => r.date));
  const firstFree = meetingDates().find((d) => !used.has(d)) || meetingDates()[0] || state.term.start || '';
  const section = state.branding.sectionName || 'meeting';
  const reasons = ['Public holiday', 'School holidays', 'No meeting this week'];
  const textFor = (reason) => (reason.startsWith('No meeting') ? `No ${section} this week` : `No ${section} – ${reason}`);
  openPopover(anchor, `
    <div class="pop-title">Add a week off</div>
    <label class="field"><span>Date</span><input type="date" id="bDate" value="${esc(firstFree)}"></label>
    <div class="field"><span>Reason</span>
      <div class="reason-chips">${reasons.map((r, i) => `<button class="swatch none ${i === 0 ? 'on' : ''}" data-reason="${esc(r)}"><span>${esc(r)}</span></button>`).join('')}</div>
    </div>
    <label class="field"><span>Text shown</span><input type="text" id="bText" value="${esc(textFor(reasons[0]))}"></label>
    <p class="hint">If there's an empty meeting row on that date, it's replaced.</p>
    <div class="pop-actions"><span></span><button class="btn btn-primary btn-sm" id="bAdd">Add week off</button></div>`,
  { type: 'break' });
  pop.querySelectorAll('[data-reason]').forEach((b) => {
    b.onclick = () => {
      pop.querySelectorAll('[data-reason]').forEach((x) => x.classList.toggle('on', x === b));
      $('#bText').value = textFor(b.dataset.reason);
    };
  });
  const add = () => {
    const date = $('#bDate').value, text = $('#bText').value.trim() || `No ${section} this week`;
    pushHistory();
    // Reuse an untouched generated row on that date rather than adding a second one.
    const blank = state.rows.find((r) => r.date === date && isBlankRow(r));
    if (blank) Object.assign(blank, { noMeeting: true, activity: text });
    else state.rows.push(newRow(date, { noMeeting: true, activity: text, time: '', uniform: '' }));
    closePopover(); save(); renderDoc();
    toast(blank ? 'Meeting night marked as a week off.' : 'Week off added.');
  };
  $('#bDate').addEventListener('input', () => {
    const h = publicHoliday($('#bDate').value);
    if (h) $('#bText').value = weekOffText(h);
  });
  $('#bAdd').onclick = add;
  $('#bText').addEventListener('keydown', (e) => { if (e.key === 'Enter') add(); });
}

/** A file-name-safe program name, e.g. "Cubs Program - Term 4 2026". */
function programFileName() {
  return (titleText() || `${state.branding.sectionName || 'Program'} Term ${state.term.term} ${state.term.year}`)
    // Plain ASCII only: some browsers drop a download's name if it has e.g. an en dash.
    .replace(/[\u2012-\u2015]/g, '-').normalize('NFKD').replace(/[^\x20-\x7e]/g, '')
    .replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function downloadFile(name, text, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  a.hidden = true;
  document.body.appendChild(a);   // some browsers ignore the file name on a detached link
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

function exportJson() {
  downloadFile(`${programFileName()}.json`, JSON.stringify(state, null, 2), 'application/json');
}

/* ---------------------------------------------------------------- calendar (.ics) export */

/**
 * Start and finish times (minutes after midnight) in a Time cell: "18:15–19:45",
 * "6:30 PM\n8:30 PM", "6:15–7:45 PM", "9 AM Sat\n4 PM Sun". Missing ones are null.
 */
function timesIn(text) {
  const found = [];
  const re = /(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)?/gi;
  let m;
  while ((m = re.exec(text || '')) && found.length < 2) {
    if (!m[2] && !m[3]) continue;
    const h = +m[1], min = +(m[2] || 0);
    if (h > 23 || min > 59) continue;
    found.push({ h, min, ap: m[3] && m[3].toLowerCase() });
  }
  // "6:15–7:45 PM": the start takes the finish's AM/PM.
  if (found.length === 2 && !found[0].ap && found[1].ap && found[0].h <= 12) found[0].ap = found[1].ap;
  const toMin = (t) => {
    if (!t) return null;
    let h = t.h;
    if (t.ap) h = (h % 12) + (t.ap === 'pm' ? 12 : 0);
    return h * 60 + t.min;
  };
  return [toMin(found[0]), toMin(found[1])];
}

function icsText(s) {
  return String(s ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

/** Fold a content line to 75 octets, as iCalendar requires. */
function icsFold(line) {
  const enc = new TextEncoder();
  const out = [];
  let cur = '', bytes = 0;
  for (const ch of line) {
    const n = enc.encode(ch).length;
    if (bytes + n > (out.length ? 74 : 75)) { out.push(cur); cur = ''; bytes = 0; }
    cur += ch; bytes += n;
  }
  out.push(cur);
  return out.join('\r\n ');
}

function exportCalendar() {
  const pad = (n) => String(n).padStart(2, '0');
  const ymd = (d) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
  const at = (d, mins) => `${ymd(d)}T${pad(Math.floor(mins / 60) % 24)}${pad(mins % 60)}00`;
  const now = new Date();
  const stamp = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}T${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}Z`;
  const [ds, de] = [state.term.startTime, state.term.endTime].map((t) => (t ? timesIn(t)[0] : null));
  const defaultLength = ds != null && de != null && de > ds ? de - ds : 120;
  const section = state.branding.sectionName || 'Scouts';
  const group = state.branding.groupName.trim();

  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Scout Program Builder//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    `X-WR-CALNAME:${icsText([group, titleText()].filter(Boolean).join(' – '))}`];
  let count = 0;
  state.rows.forEach((r) => {
    const start = parseDate(r.date);
    if (!start) return;
    const end = parseDate(r.endDate) && parseDate(r.endDate) >= start ? parseDate(r.endDate) : start;
    const [s, e] = r.noMeeting ? [null, null] : timesIn(r.time);
    const ev = ['BEGIN:VEVENT', `UID:${r.id}@scout-program-builder`, `DTSTAMP:${stamp}`];
    if (s != null) {
      // Times are local ("floating"), so they show as written wherever the family is.
      let finishDay = end, finish = e;
      if (finish == null) finish = s + defaultLength;
      if (finishDay === start && finish <= s) finish = s + defaultLength;
      if (finish >= 24 * 60) { finishDay = addDays(finishDay, Math.floor(finish / (24 * 60))); finish %= 24 * 60; }
      ev.push(`DTSTART:${at(start, s)}`, `DTEND:${at(finishDay, finish)}`);
    } else {
      ev.push(`DTSTART;VALUE=DATE:${ymd(start)}`, `DTEND;VALUE=DATE:${ymd(addDays(end, 1))}`);
    }
    const title = r.noMeeting ? (r.activity || `No ${section} this week`) : `${section}: ${r.activity || 'Meeting'}`;
    ev.push(`SUMMARY:${icsText(title)}`);
    if (r.noMeeting) ev.push('TRANSP:TRANSPARENT');
    else {
      if (r.where) ev.push(`LOCATION:${icsText(r.where)}`);
      const patrol = r.patrol ? `Duty patrol: ${r.patrol}` : '';
      const details = [r.description, r.uniform && `Uniform: ${r.uniform}`, r.forms && r.forms !== '-' && `Forms: ${r.forms}`,
        r.cost && r.cost !== '-' && `Cost: ${r.cost}`, r.leader && `Leader: ${r.leader}`, patrol, r.notes].filter((x) => x && x.trim());
      if (details.length) ev.push(`DESCRIPTION:${icsText(details.join('\n'))}`);
    }
    ev.push('END:VEVENT');
    lines.push(...ev);
    count++;
  });
  lines.push('END:VCALENDAR');
  if (!count) { toast('Add some dated activities first.', 'error'); return; }
  downloadFile(`${programFileName()}.ics`, lines.map(icsFold).join('\r\n') + '\r\n', 'text/calendar');
  toast(`Calendar file with ${count} event${count === 1 ? '' : 's'} saved. Families can open it to add the program to their calendar.`);
}

/* ---------------------------------------------------------------- spreadsheet (.csv) */

/* Columns of the activities spreadsheet, in order. Week is written for reference only. */
const CSV_FIELDS = [
  ['week', 'Week'], ['date', 'Date'], ['endDate', 'End date'], ['dateLabel', 'Date text'], ['time', 'Time'],
  ['activity', 'Activity'], ['description', 'Description'], ['uniform', 'Uniform'], ['forms', 'Forms'],
  ['where', 'Where'], ['patrol', 'Duty Patrol'], ['leader', 'Leader'], ['cost', 'Cost'],
  ['challenge', 'Challenge Area'], ['notes', 'Notes'], ['category', 'Highlight'], ['noMeeting', 'No meeting'],
];
const CSV_ALIASES = {
  week: 'week', date: 'date', enddate: 'endDate', ends: 'endDate', finishdate: 'endDate', datetext: 'dateLabel',
  time: 'time', times: 'time', startfinish: 'time', startfinishtime: 'time', activity: 'activity',
  description: 'description', uniform: 'uniform', forms: 'forms', where: 'where', location: 'where',
  dutypatrol: 'patrol', patrol: 'patrol', leader: 'leader', leaders: 'leader', cost: 'cost',
  challengearea: 'challenge', challenge: 'challenge', notes: 'notes', highlight: 'category', category: 'category',
  nomeeting: 'noMeeting', weekoff: 'noMeeting',
};
const headerKey = (h) => String(h || '').toLowerCase().replace(/[^a-z0-9]/g, '');

function csvCell(v) {
  const s = String(v ?? '');
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** A date spreadsheets leave alone (a weekday prefix stops Excel turning it into a number). */
function csvDate(iso) {
  const d = parseDate(iso);
  return d ? `${DAY_SHORT[d.getDay()]} ${d.getDate()} ${MONTH_SHORT[d.getMonth()]} ${d.getFullYear()}` : '';
}

function exportCsv() {
  const weekLabel = new Map();
  weekGroups().forEach((g) => g.rows.forEach((r) => {
    weekLabel.set(r.id, typeof g.key === 'number' ? `${state.options.weekPrefix || ''}${g.key}`.trim() : (r.date ? state.options.holidayLabel || '' : ''));
  }));
  const value = (r, k) => {
    if (k === 'week') return weekLabel.get(r.id) || '';
    if (k === 'date' || k === 'endDate') return csvDate(r[k]);
    if (k === 'challenge') return state.challenges.find((c) => c.id === r.challenge)?.label || '';
    if (k === 'category') return state.categories.find((c) => c.id === r.category)?.label || '';
    if (k === 'noMeeting') return r.noMeeting ? 'Yes' : '';
    return r[k] ?? '';
  };
  const lines = [CSV_FIELDS.map(([, h]) => h), ...state.rows.map((r) => CSV_FIELDS.map(([k]) => value(r, k)))];
  // A byte-order mark so Excel reads it as UTF-8 (en dashes, apostrophes, emoji).
  downloadFile(`${programFileName()} - activities.csv`, '﻿' + lines.map((l) => l.map(csvCell).join(',')).join('\r\n') + '\r\n', 'text/csv');
  toast('Spreadsheet saved. Edit it in Excel, Google Sheets or Numbers, save as CSV, then use Open.');
}

/** RFC 4180 parsing, with the delimiter (comma, semicolon or tab) taken from the header row. */
function parseCsv(text) {
  text = text.replace(/^﻿/, '');
  const head = text.split(/\r?\n/, 1)[0];
  const delim = [',', ';', '\t'].sort((a, b) => head.split(b).length - head.split(a).length)[0];
  const rows = [];
  let row = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && cell === '') quoted = true;
    else if (ch === delim) { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

/** Read a date as typed or as a spreadsheet saved it: "Tue 13 Oct 2026", "13/10/2026", "2026-10-13", "13 Oct". */
function parseLooseDate(text) {
  const t = String(text || '').trim();
  if (!t) return '';
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(t);
  const iso = (y, mo, d) => {
    const dt = new Date(y, mo - 1, d);
    return dt.getFullYear() === y && dt.getMonth() === mo - 1 && dt.getDate() === d ? toISO(dt) : '';
  };
  if (m) return iso(+m[1], +m[2], +m[3]);
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/.exec(t);                 // Australian day/month/year
  if (m) return iso(m[3].length === 2 ? 2000 + +m[3] : +m[3], +m[2], +m[1]);
  m = /(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]{3,})\.?,?(?:\s+(\d{4}))?/i.exec(t.replace(/^[a-z]+,?\s+/i, (w) => (/^\d/.test(w) ? w : '')));
  if (m) {
    const mo = MONTH_SHORT.findIndex((x) => m[2].toLowerCase().startsWith(x.toLowerCase())) + 1;
    if (mo) return iso(m[3] ? +m[3] : state.term.year, mo, +m[1]);
  }
  return '';
}

/** Turn a spreadsheet into rows. Returns { rows, unread } or throws if there's no usable header. */
function rowsFromCsv(text) {
  const table = parseCsv(text).filter((r) => r.some((c) => c.trim()));
  if (table.length < 1) throw new Error('empty');
  const byLabel = {};
  state.columns.forEach((c) => { byLabel[headerKey(c.label)] = c.key; });
  const keys = table[0].map((h) => CSV_ALIASES[headerKey(h)] || byLabel[headerKey(h)] || null);
  if (!keys.includes('activity') && !keys.includes('date')) throw new Error('no header');
  const find = (list, v) => list.find((x) => [x.id, x.label].some((y) => headerKey(y) === headerKey(v)))?.id || '';
  let unread = 0;
  const rows = table.slice(1).map((cells) => {
    const r = newRow('');
    keys.forEach((k, i) => {
      const v = (cells[i] ?? '').trim();
      if (!k || k === 'week') return;
      if (k === 'date' || k === 'endDate') {
        const d = parseLooseDate(v);
        if (v && !d && k === 'date') { r.dateLabel = r.dateLabel || v; unread++; }
        // Wording beyond a plain date ("Sat or Sun 7 or 8 Nov") is kept as the date's text.
        const plain = /^(?:[a-z]+,?\s+)?\d{1,2}(?:st|nd|rd|th)?\s+[a-z]+\.?(?:\s+\d{4})?$|^\d{4}-\d{1,2}-\d{1,2}|^\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}$/i;
        if (v && d && k === 'date' && !plain.test(v)) r.dateLabel = r.dateLabel || v;
        r[k] = d;
      } else if (k === 'challenge') r.challenge = v ? find(state.challenges, v) : '';
      else if (k === 'category') r.category = v ? find(state.categories, v) : '';
      else if (k === 'noMeeting') r.noMeeting = /^(y|yes|true|1|x|✓)$/i.test(v);
      else if (k === 'dateLabel') { if (v) r.dateLabel = v; }
      else r[k] = v;
    });
    if (r.noMeeting && !keys.includes('time')) r.time = '';
    return r;
  });
  return { rows, unread };
}

async function importCsv(text, fileName) {
  let parsed;
  try { parsed = rowsFromCsv(text); } catch {
    toast('That spreadsheet needs a header row with at least Date or Activity.', 'error');
    return;
  }
  const { rows, unread } = parsed;
  if (!rows.length) { toast('That spreadsheet has no activities.', 'error'); return; }
  const choice = await modal({
    title: 'Open spreadsheet',
    body: `<p><strong>${rows.length}</strong> activit${rows.length === 1 ? 'y' : 'ies'} found in <strong>${esc(fileName)}</strong>. Branding, leaders and settings stay as they are in this program.</p>`,
    buttons: [{ label: 'Cancel', value: null, cls: 'btn-text' },
      { label: 'As a new program', value: 'new', cls: 'btn-outline' },
      { label: 'Replace these activities', value: 'replace', cls: 'btn-primary' }],
  });
  if (!choice) return;
  if (choice === 'new') {
    const c = copyOf(state);
    c.rows = rows;
    c.branding.versionText = '';
    addProgram(c);
  } else {
    pushHistory();
    state.rows = rows;
    save(); renderDoc();
  }
  toast(`${rows.length} activit${rows.length === 1 ? 'y' : 'ies'} imported.${unread ? ` ${unread} date${unread === 1 ? '' : 's'} couldn't be read and ${unread === 1 ? 'is' : 'are'} shown as text — click to set ${unread === 1 ? 'it' : 'them'}.` : ''}`);
}

function openSavePopover(anchor) {
  openPopover(anchor, `
    <div class="menu">
      <button data-save="csv"><svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M3 15h18M9 4v16"/></svg>Activities spreadsheet <small>.csv</small></button>
      <button data-save="json"><svg viewBox="0 0 24 24"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6"/></svg>Full program <small>.json</small></button>
    </div>
    <p class="hint">A spreadsheet holds the activities, for editing in Excel or Google Sheets. A full program also keeps branding, leaders and settings.</p>`, { type: 'save' });
  pop.querySelectorAll('[data-save]').forEach((b) => {
    b.onclick = () => { closePopover(); if (b.dataset.save === 'csv') exportCsv(); else exportJson(); };
  });
}

function importJson() {
  const input = $('#fileJson');
  input.value = '';
  input.onchange = () => {
    const f = input.files[0]; if (!f) return;
    const fr = new FileReader();
    fr.onload = () => {
      const text = String(fr.result);
      if (/\.(csv|tsv|txt)$/i.test(f.name) || !/^\s*[\[{]/.test(text.replace(/^\ufeff/, ''))) { importCsv(text, f.name); return; }
      try {
        const data = JSON.parse(text);
        if (!data || typeof data !== 'object' || !data.branding) throw new Error('bad');
        addProgram(copyOf(normalise(data)));
        toast('Program opened. It is saved alongside your others under Programs.');
      } catch { toast('That file is not a saved program or spreadsheet.', 'error'); }
    };
    fr.readAsText(f);
  };
  input.click();
}

async function newProgram() {
  const t = state.term;
  const next = t.term >= 4 ? { year: t.year + 1, term: 1 } : { year: t.year, term: t.term + 1 };
  const choice = await modal({
    title: 'Start a new program',
    body: `<p>This program stays saved under <strong>Programs</strong>. The new one keeps your branding, leaders, columns and lists, with fresh meeting dates.</p>`,
    buttons: [{ label: 'Cancel', value: null, cls: 'btn-text' },
      { label: `Same term (T${t.term} ${t.year})`, value: 'same', cls: 'btn-outline' },
      { label: `Next term (T${next.term} ${next.year})`, value: 'next', cls: 'btn-primary' }],
  });
  if (!choice) return;
  const c = copyOf(state);
  c.branding.versionText = '';
  c.rows = [];
  save();
  const prev = state;
  state = c;
  if (choice === 'next') { Object.assign(state.term, next); if (!applyTermPreset()) { state.term.start = ''; state.term.end = ''; } }
  state.rows = generateRows();
  state = prev;
  addProgram(c);
  if (!c.rows.length) toast('Enter the term dates, then use Generate dates.');
}

async function resetAll() {
  const ok = await modal({
    title: 'Reset everything?',
    body: '<p>This clears branding, leaders, lists and activities back to the defaults. You can Undo straight afterwards.</p>',
    buttons: [{ label: 'Cancel', value: false, cls: 'btn-text' }, { label: 'Reset', value: true, cls: 'btn-danger' }],
  });
  if (!ok) return;
  pushHistory();
  state = defaultState();
  state.rows = generateRows();
  save(); renderAll();
}

function printProgram() {
  closePopover(); hideHandle();
  document.activeElement?.blur();
  fit();
  window.print();
}

/* ---------------------------------------------------------------- events */

function onBoundInput(e) {
  const el = e.target.closest('[data-bind]');
  if (!el) return;
  const path = el.dataset.bind;
  let v = el.type === 'checkbox' ? el.checked : el.value;
  if (el.dataset.type === 'number') { v = parseFloat(v); if (Number.isNaN(v)) return; }
  if (path === 'branding.color' && !/^#[0-9a-f]{6}$/i.test(v)) return;

  const prevDefaultTime = defaultTimeText();
  setPath(state, path, v);

  if (path === 'branding.section' && SECTIONS[v]) {
    state.branding.sectionName = SECTIONS[v].name;
    state.branding.color = SECTIONS[v].color;
    state.branding.titleColor = luminance(SECTIONS[v].color) < 0.45 ? 'auto' : 'dark';
  }
  if (['term.region', 'term.year', 'term.term'].includes(path)) applyTermPreset();
  const datesChanged = ['term.region', 'term.year', 'term.term', 'term.start', 'term.end', 'term.meetingDay', 'options.publicHolidays'].includes(path);

  // Rows still showing the old default time follow the new default.
  const nextDefaultTime = defaultTimeText();
  if (nextDefaultTime !== prevDefaultTime) {
    state.rows.forEach((r) => { if (!r.time || r.time === prevDefaultTime) r.time = nextDefaultTime; });
  }

  if (datesChanged && e.type === 'change') {
    if (!rowsHaveContent()) state.rows = generateRows();
    else toast('Term changed — use "Generate dates" to add the new meeting dates.');
  }
  saveSoon();
  syncInputs();
  renderDoc();
}

function onListInput(e) {
  const el = e.target.closest('[data-list]');
  if (!el) return;
  const list = el.dataset.list, i = +el.dataset.i, field = el.dataset.field;
  const arr = list === 'leaders' ? state.branding.leaders : state[list];
  let v = el.type === 'checkbox' ? el.checked : el.value;
  if (field === 'width') { v = parseFloat(v); if (!(v > 0)) return; }
  if (list === 'leaders' && field === 'name') {
    const old = arr[i].name.trim();
    if (old) state.rows.forEach((r) => { if (r.leader === old) r.leader = v.trim(); });
  }
  if (list === 'patrols' && field === 'name') {
    const old = arr[i].name;
    state.rows.forEach((r) => { if (r.patrol && r.patrol === old) r.patrol = v; });
  }
  arr[i][field] = v;
  if (list === 'columns' && field === 'visible') el.closest('.list-row').classList.toggle('off', !v);
  if (list === 'challenges' && field === 'color') el.parentElement.querySelector('.ch-preview').innerHTML = challengeIconOnly(arr[i]);
  saveSoon();
  renderDoc();
}

function bindEvents() {
  const side = $('#sidebar');
  side.addEventListener('focusin', (e) => { if (e.target.matches('input, select')) pushHistory(); });
  side.addEventListener('input', (e) => { onBoundInput(e); onListInput(e); });
  side.addEventListener('change', (e) => { if (e.target.closest('[data-bind]')) onBoundInput(e); });

  side.addEventListener('click', async (e) => {
    const add = e.target.closest('[data-add]');
    const del = e.target.closest('[data-del]');
    const mv = e.target.closest('[data-move-col]');
    const al = e.target.closest('[data-align]');
    const ic = e.target.closest('[data-icon]');
    if (add) {
      pushHistory();
      const k = add.dataset.add;
      if (k === 'leaders') state.branding.leaders.push({ name: '', phone: '' });
      if (k === 'patrols') state.patrols.push({ name: '', color: '#555555' });
      if (k === 'categories') state.categories.push({ id: uid(), label: 'New highlight', color: '#FFE0B2' });
      if (k === 'challenges') state.challenges.push({ id: uid(), label: 'New area', color: '#555555', icon: null });
      save(); renderAll();
      const rows = $$('.list-row', add.previousElementSibling);
      $('input[type=text]', rows[rows.length - 1])?.focus();
    } else if (del) {
      pushHistory();
      const k = del.dataset.del, i = +del.dataset.i;
      (k === 'leaders' ? state.branding.leaders : state[k]).splice(i, 1);
      save(); renderAll();
    } else if (mv) {
      pushHistory();
      const i = +mv.dataset.moveCol, j = i + +mv.dataset.dir;
      [state.columns[i], state.columns[j]] = [state.columns[j], state.columns[i]];
      save(); renderAll();
    } else if (al) {
      pushHistory();
      const c = state.columns[+al.dataset.align];
      c.align = c.align === 'left' ? 'center' : 'left';
      save(); renderAll();
    } else if (ic) {
      const c = state.challenges[+ic.dataset.icon];
      if (c.icon) { pushHistory(); c.icon = null; }
      else {
        const img = await pickImage(); if (!img) return;
        pushHistory(); c.icon = img;
      }
      save(); renderAll();
    }
  });

  $('#btnLogo').onclick = async () => {
    const img = await pickImage(); if (!img) return;
    pushHistory(); state.branding.logo = img; save(); renderAll();
  };
  $('#btnLogoClear').onclick = () => { pushHistory(); state.branding.logo = null; save(); renderAll(); };

  // Inline editing in the sheet.
  const sheet = $('#sheet');
  sheet.addEventListener('focusin', (e) => { if (e.target.matches('.ed')) { pushHistory(); e.target.closest('tr')?.classList.add('editing'); } });
  sheet.addEventListener('focusout', (e) => {
    if (!e.target.matches('.ed')) return;
    e.target.closest('tr')?.classList.remove('editing');
    if (!e.target.textContent.trim()) e.target.textContent = '';
    if (e.target.dataset.key === 'time') {
      const before = state.rows.map((r) => r.id).join();
      sortRows();
      if (state.rows.map((r) => r.id).join() !== before) { save(); setTimeout(renderDoc, 0); }
    }
  });
  sheet.addEventListener('input', (e) => {
    const ed = e.target.closest('.ed'); if (!ed) return;
    const r = rowById(ed.closest('tr').dataset.id); if (!r) return;
    r[ed.dataset.key] = ed.innerText.replace(/\n$/, '');
    r.autoHoliday = false;
    saveSoon(); fitSoon();
  });
  sheet.addEventListener('paste', (e) => {
    if (!e.target.closest('.ed')) return;
    e.preventDefault();
    document.execCommand('insertText', false, (e.clipboardData || window.clipboardData).getData('text/plain'));
  });
  sheet.addEventListener('click', (e) => {
    const td = e.target.closest('td.clickable'); if (!td) return;
    const r = rowById(td.closest('tr').dataset.id); if (!r) return;
    if (td.dataset.pop === 'date') openDatePopover(td, r);
    else if (td.dataset.pop === 'leader') openLeaderPopover(td, r);
    else openChoicePopover(td, r, td.dataset.pop);
  });
  sheet.addEventListener('mouseover', (e) => {
    const tr = e.target.closest('tbody tr[data-id]');
    if (tr) showHandle(tr);
  });
  $('#canvas').addEventListener('mouseleave', (e) => { if (!handle.contains(e.relatedTarget) && pop.hidden) hideHandle(); });
  $('#canvas').addEventListener('scroll', () => { hideHandle(); closePopover(); });
  handle.addEventListener('click', () => { if (handleRow) openRowMenu(handle, handleRow); });

  $('#btnGenerate').onclick = generateDates;
  $('#btnGenerate2').onclick = generateDates;
  $('#btnAddRow').onclick = addActivity;
  $('#btnAddBreak').onclick = (e) => openBreakPopover(e.currentTarget);
  $('#btnUndo').onclick = undo;
  $('#btnNew').onclick = newProgram;
  $('#btnPrograms').onclick = (e) => openProgramsMenu(e.currentTarget);
  $('#btnImport').onclick = importJson;
  $('#btnExport').onclick = (e) => openSavePopover(e.currentTarget);
  $('#btnCalendar').onclick = exportCalendar;
  $('#btnPrint').onclick = printProgram;
  $('#btnReset').onclick = resetAll;
  $('#zoomSelect').onchange = (e) => { zoom = e.target.value; applyZoom(); };

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { closePopover(); }
    const inField = e.target.closest('input, textarea, select, [contenteditable]');
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey && !inField) { e.preventDefault(); undo(); }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'p') { e.preventDefault(); printProgram(); }
  });
  window.addEventListener('resize', debounce(() => { applyZoom(); hideHandle(); }, 100));
  // Browsers name a saved PDF after the page title, so use the program's title while printing.
  const appTitle = document.title;
  window.addEventListener('beforeprint', () => {
    closePopover(); hideHandle();
    document.title = programFileName() || appTitle;
  });
  window.addEventListener('afterprint', () => { document.title = appTitle; });
}

/* ---------------------------------------------------------------- init */

function init() {
  $('[data-bind="term.region"]').innerHTML = REGIONS.map(([v, label]) => `<option value="${v}">${esc(label)}</option>`).join('');
  const ys = $('#yearSelect');
  const thisYear = new Date().getFullYear();
  for (let y = thisYear - 1; y <= thisYear + 3; y++) ys.insertAdjacentHTML('beforeend', `<option value="${y}">${y}</option>`);
  state = load();
  bindEvents();
  renderAll();
  // Fonts change text metrics — refit once they're ready.
  if (document.fonts?.ready) document.fonts.ready.then(() => fit());
}

init();
