/* Scout Program Builder — all state lives in `state` and is saved to localStorage. */
'use strict';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const STORE_KEY = 'scoutProgramBuilder.v1';

let state;
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
  if (f === 'long') return `${DAY_LONG[d.getDay()]} ${d.getDate()} ${MONTH_LONG[d.getMonth()]}`;
  if (f === 'numeric') return `${DAY_SHORT[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}`;
  return `${DAY_SHORT[d.getDay()]} ${d.getDate()} ${MONTH_SHORT[d.getMonth()]}`;
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
      groupName: 'Strathalbyn Scout Group', section: 'cubs', sectionName: 'Cubs', color: SECTIONS.cubs.color,
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
      highlight: 'date-activity', challengeDisplay: 'icon', weekPrefix: 'Week ', dateFormat: 'short',
      paper: 'A4', orientation: 'landscape', margin: 8, autoFit: true, maxFont: 11, minFont: 6.5,
      stretch: true, showLegend: true, rotatePatrols: true,
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
  s.challenges.forEach((c) => { if (OLD_CHALLENGE_COLORS[c.id] && c.color?.toUpperCase() === OLD_CHALLENGE_COLORS[c.id]) c.color = DEFAULT_CHALLENGES.find((d) => d.id === c.id).color; });
  s.rows = Array.isArray(raw.rows) ? raw.rows.map((r) => ({ ...newRowShape(), ...r, id: r.id || uid() })) : [];
  return s;
}
function newRowShape() {
  return { id: '', date: '', endDate: '', dateLabel: '', time: '', activity: '', description: '', uniform: '', forms: '',
    where: '', patrol: '', leader: '', cost: '', challenge: '', notes: '', category: '' };
}

function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); }
  catch { toast('Could not save in this browser (storage full?). Use "Save file" to keep a copy.', 'error'); }
}
const saveSoon = debounce(save, 400);

function load() {
  let raw = null;
  try { raw = JSON.parse(localStorage.getItem(STORE_KEY)); } catch { raw = null; }
  if (raw) return normalise(raw);
  state = defaultState();
  state.rows = generateRows();
  return state;
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

function generateRows(existing = []) {
  const usedDates = new Set(existing.map((r) => r.date));
  const patrols = state.patrols.filter((p) => p.name);
  return meetingDates().map((date, i) => {
    if (usedDates.has(date)) return null;
    const patrol = state.options.rotatePatrols && patrols.length ? patrols[i % patrols.length].name : '';
    return newRow(date, { patrol });
  }).filter(Boolean);
}

function weekOf(iso) {
  const d = parseDate(iso), s = parseDate(state.term.start), e = parseDate(state.term.end);
  if (!d || !s) return null;
  if (d < s || (e && d > e)) return null;
  const monday = addDays(s, -((s.getDay() + 6) % 7));
  return Math.floor(dayDiff(monday, d) / 7) + 1;
}

/** Stable sort by date; undated rows travel with the row above them. */
function sortRows() {
  let last = '';
  const keyed = state.rows.map((r, i) => { if (r.date) last = r.date; return { r, k: r.date || last, i }; });
  keyed.sort((a, b) => (a.k < b.k ? -1 : a.k > b.k ? 1 : a.i - b.i));
  state.rows = keyed.map((x) => x.r);
}

function applyTermPreset() {
  const t = state.term;
  const preset = TERM_DATES[t.region]?.[t.year]?.[t.term - 1];
  if (preset) { t.start = preset[0]; t.end = preset[1]; }
  return !!preset;
}

function rowsHaveContent() {
  return state.rows.some((r) => ['activity', 'description', 'notes', 'leader', 'cost', 'where'].some((k) => (r[k] || '').trim()) || r.challenge || r.category);
}

/* ---------------------------------------------------------------- sheet rendering */

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
  const tint = cat && (hl === 'row' || (HL_KEYS[hl] || []).includes(k)) ? ` style="background:${esc(cat.color)}"` : '';
  const align = ` data-align="${col.align || 'center'}"`;
  const timeHidden = !state.columns.find((c) => c.key === 'time')?.visible;

  if (k === 'date') {
    const txt = dateText(r, timeHidden);
    return `<td class="c-date clickable" data-pop="date"${align}${tint}>${txt ? esc(txt) : '<span class="ph">Set date</span>'}</td>`;
  }
  if (k === 'challenge') return `<td class="c-challenge clickable" data-pop="challenge"${align}${tint}>${challengeHTML(r.challenge)}</td>`;
  if (k === 'patrol') return `<td class="c-patrol clickable" data-pop="patrol"${align}${tint}>${patrolHTML(r.patrol)}</td>`;
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

  // Group rows by term week (undated rows join the group above).
  const groups = [];
  let prevKey = Symbol('start');
  state.rows.forEach((r) => {
    const key = r.date ? (weekOf(r.date) ?? `out-${r.date}`) : prevKey;
    if (groups.length && key === prevKey) groups[groups.length - 1].rows.push(r);
    else groups.push({ key, rows: [r] });
    prevKey = key;
  });

  const body = groups.map((g) => g.rows.map((r, i) => {
    const cat = state.categories.find((c) => c.id === r.category);
    const cells = cols.map((c) => {
      if (c.key !== 'week') return cellHTML(c, r);
      if (i > 0) return '';
      const label = typeof g.key === 'number' ? `${o.weekPrefix || ''}${g.key}` : '–';
      const tint = cat && o.highlight === 'row' && g.rows.length === 1 ? ` style="background:${esc(cat.color)}"` : '';
      return `<td class="c-week" rowspan="${g.rows.length}"${tint}><span class="wk">${esc(label)}</span></td>`;
    }).join('');
    return `<tr data-id="${r.id}">${cells}</tr>`;
  }).join('')).join('');

  sheet.innerHTML = `
    <div class="doc-header">
      <div class="doc-logo">${logoHTML()}</div>
      <div class="doc-titles">
        <div class="doc-group">${groupNameHTML()}</div>
        <div class="doc-title">${esc(titleText())}</div>
      </div>
      <div class="doc-side">
        ${leadersHTML}
        ${b.versionText ? `<div class="doc-version">${esc(b.versionText)}</div>` : ''}
      </div>
    </div>
    ${legendHTML}
    <table class="prog">
      <colgroup>${cols.map((c) => `<col style="width:${((+c.width || 1) / totalW) * 100}%">`).join('')}</colgroup>
      <thead><tr>${cols.map((c) => `<th><span class="th-l">${esc(c.label)}</span></th>`).join('')}</tr></thead>
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

function fit() {
  const sheet = $('#sheet');
  const o = state.options;
  const table = $('.prog', sheet);
  const status = $('#fitStatus');
  sheet.classList.remove('multi');
  if (table) table.style.height = '';
  const setFs = (pt) => sheet.style.setProperty('--fs', `${pt}pt`);
  // Week labels and heading words never break mid-word, so they must also fit their column's width.
  const weeksOk = () => $$('.c-week .wk, thead .th-l', sheet).every((w) => {
    const td = w.parentElement, cs = getComputedStyle(td);
    return w.offsetWidth <= td.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) + 0.5;
  });
  const fits = () => sheet.scrollHeight <= sheet.clientHeight + 1 && weeksOk();

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
      if (!weeksOk()) {
        let lo = min, hi = max;
        for (let i = 0; i < 9; i++) { const mid = (lo + hi) / 2; setFs(mid); if (weeksOk()) lo = mid; else hi = mid; }
        fs = Math.floor(lo * 10) / 10; setFs(fs);
      }
    }
  }

  const one = sheet.scrollHeight <= sheet.clientHeight + 1;
  if (one && o.stretch && table && state.rows.length) {
    const spare = sheet.clientHeight - sheet.scrollHeight;
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

function syncInputs() {
  $$('[data-bind]').forEach((el) => {
    const v = getPath(state, el.dataset.bind);
    if (el === document.activeElement) return;
    if (el.type === 'checkbox') el.checked = !!v;
    else el.value = v ?? '';
  });
  const t = state.term;
  const hasPreset = !!TERM_DATES[t.region]?.[t.year]?.[t.term - 1];
  const n = meetingDates().length;
  $('#termHint').textContent = `${t.region === 'custom' || !hasPreset ? 'Enter term dates above. ' : ''}${n} ${DAY_LONG[t.meetingDay]} meeting${n === 1 ? '' : 's'} this term.`;
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
  applyPageSize();
  syncInputs();
  renderLists();
  renderSheet();
  fit();
}
function renderDoc() { applyPageSize(); renderSheet(); fit(); }

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
  openPopover(td, `
    <div class="pop-title">Date</div>
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
  const idx = state.rows.indexOf(r);
  const icon = (d) => `<svg viewBox="0 0 24 24">${d}</svg>`;
  openPopover(anchor, `
    <div class="menu">
      <button data-act="below">${icon('<path d="M12 5v14M5 12h14"/>')}Add activity below <small>same date</small></button>
      <button data-act="above">${icon('<path d="M12 5v14M5 12h14"/>')}Add activity above</button>
      <button data-act="dup">${icon('<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>')}Duplicate</button>
      <button data-act="up" ${idx === 0 ? 'disabled' : ''}>${icon('<path d="m6 15 6-6 6 6"/>')}Move up</button>
      <button data-act="down" ${idx === state.rows.length - 1 ? 'disabled' : ''}>${icon('<path d="m6 9 6 6 6-6"/>')}Move down</button>
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
        case 'up': [state.rows[i - 1], state.rows[i]] = [state.rows[i], state.rows[i - 1]]; break;
        case 'down': [state.rows[i + 1], state.rows[i]] = [state.rows[i], state.rows[i + 1]]; break;
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
  const table = tr.closest('table').getBoundingClientRect();
  const r = tr.getBoundingClientRect();
  handle.hidden = false;
  handle.style.top = `${r.top + r.height / 2 - 14}px`;
  handle.style.left = `${table.left - 34}px`;
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

function exportJson() {
  const name = `${state.branding.sectionName || 'Program'} Program Term ${state.term.term} ${state.term.year}`.replace(/[^\w\- ]+/g, '').trim();
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${name}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function importJson() {
  const input = $('#fileJson');
  input.value = '';
  input.onchange = () => {
    const f = input.files[0]; if (!f) return;
    const fr = new FileReader();
    fr.onload = () => {
      try {
        const data = JSON.parse(fr.result);
        if (!data || typeof data !== 'object' || !data.branding) throw new Error('bad');
        pushHistory();
        state = normalise(data);
        save(); renderAll();
        toast('Program opened.');
      } catch { toast('That file is not a saved program.', 'error'); }
    };
    fr.readAsText(f);
  };
  input.click();
}

async function newProgram() {
  const ok = await modal({
    title: 'Start a new program?',
    body: '<p>Your branding, leaders, columns and lists are kept. All activities are cleared and meeting dates are generated for the chosen term. Save a file first if you want to keep this one.</p>',
    buttons: [{ label: 'Cancel', value: false, cls: 'btn-text' }, { label: 'Start new program', value: true, cls: 'btn-primary' }],
  });
  if (!ok) return;
  pushHistory();
  state.branding.versionText = '';
  state.rows = generateRows();
  save(); renderAll();
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
  const datesChanged = ['term.region', 'term.year', 'term.term', 'term.start', 'term.end', 'term.meetingDay'].includes(path);

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
  });
  sheet.addEventListener('input', (e) => {
    const ed = e.target.closest('.ed'); if (!ed) return;
    const r = rowById(ed.closest('tr').dataset.id); if (!r) return;
    r[ed.dataset.key] = ed.innerText.replace(/\n$/, '');
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
  $('#btnSort').onclick = () => { pushHistory(); sortRows(); save(); renderDoc(); toast('Sorted by date.'); };
  $('#btnUndo').onclick = undo;
  $('#btnNew').onclick = newProgram;
  $('#btnImport').onclick = importJson;
  $('#btnExport').onclick = exportJson;
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
  window.addEventListener('beforeprint', () => { closePopover(); hideHandle(); });
}

/* ---------------------------------------------------------------- init */

function init() {
  const ys = $('#yearSelect');
  const thisYear = new Date().getFullYear();
  for (let y = thisYear - 1; y <= thisYear + 3; y++) ys.insertAdjacentHTML('beforeend', `<option value="${y}">${y}</option>`);
  state = load();
  if (![...ys.options].some((o) => +o.value === state.term.year)) ys.insertAdjacentHTML('afterbegin', `<option value="${state.term.year}">${state.term.year}</option>`);
  bindEvents();
  renderAll();
  // Fonts change text metrics — refit once they're ready.
  if (document.fonts?.ready) document.fonts.ready.then(() => fit());
}

init();
