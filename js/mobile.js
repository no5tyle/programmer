/*
 * Phone and tablet view. Editing happens in a compact week list and full-screen forms; the real
 * printed sheet is kept laid out off-screen and shown by Preview. Uses the same state, saving
 * and rendering as the desktop editor (js/app.js), and reuses its settings controls.
 */
'use strict';

const VIEW_KEY = 'scoutProgramBuilder.view';   // 'auto' | 'desktop' | 'mobile'
const smallScreen = window.matchMedia('(max-width: 1099px), (pointer: coarse) and (max-width: 1400px)');
const panelStack = [];

function viewPref() { try { return localStorage.getItem(VIEW_KEY) || 'auto'; } catch { return 'auto'; } }
function isMobileView() { const p = viewPref(); return p === 'mobile' || (p === 'auto' && smallScreen.matches); }
function setViewPref(v) {
  try { localStorage.setItem(VIEW_KEY, v); } catch { /* per-session only */ }
  applyView();
}

function applyView() {
  const mobile = isMobileView();
  document.body.classList.toggle('mobile', mobile);
  if (!mobile) { closeAllPanels(); document.body.classList.remove('m-preview'); }
  closePopover(); hideHandle();
  renderMobile();
  fit();
}

/* ---------------------------------------------------------------- main list */

function shortDate(r) {
  if (r.dateLabel) return r.dateLabel;
  const d = parseDate(r.date);
  if (!d) return 'No date';
  let txt = `${DAY_SHORT[d.getDay()]} ${d.getDate()} ${MONTH_SHORT[d.getMonth()]}`;
  const e = parseDate(r.endDate);
  if (e && r.endDate !== r.date) txt += ` – ${DAY_SHORT[e.getDay()]} ${e.getDate()}`;
  return txt;
}

function rowMeta(r) {
  if (r.noMeeting) return '';
  const visible = (k) => state.columns.find((c) => c.key === k)?.visible;
  const bits = [];
  if (r.patrol && visible('patrol')) bits.push(`<span>${patrolHTML(r.patrol)}</span>`);
  if (r.leader && visible('leader')) bits.push(`<span>${esc(r.leader)}</span>`);
  if (r.where && visible('where')) bits.push(`<span>${esc(r.where)}</span>`);
  if (r.cost && r.cost !== '-' && visible('cost')) bits.push(`<span>${esc(r.cost)}</span>`);
  return bits.join('<span class="sep">·</span>');
}

function rowItem(r) {
  const cat = state.categories.find((c) => c.id === r.category);
  const ch = state.challenges.find((c) => c.id === r.challenge);
  const time = r.noMeeting ? '' : (r.time || '').split('\n')[0];
  const meta = rowMeta(r);
  return `<button class="m-row ${r.noMeeting ? 'off' : ''}" data-id="${r.id}" ${cat && !r.noMeeting ? `style="--cat:${esc(cat.color)}"` : ''}>
    <span class="m-when"><b>${esc(shortDate(r))}</b>${time ? `<small>${esc(time)}</small>` : ''}</span>
    <span class="m-what"><span class="m-act">${r.activity ? esc(r.activity) : '<i>Add activity</i>'}</span>${meta ? `<small class="m-meta">${meta}</small>` : ''}</span>
    ${ch && !r.noMeeting ? `<span class="m-ch">${challengeIconOnly(ch)}</span>` : ''}
    <svg class="m-chev" viewBox="0 0 24 24"><path d="m9 6 6 6-6 6"/></svg>
  </button>`;
}

function renderMobile() {
  if (!document.body.classList.contains('mobile')) return;
  $('#mTitleMain').textContent = titleText() || 'Untitled program';
  $('#mTitleSub').textContent = state.branding.groupName.trim() || 'Tap to switch program';
  const groups = weekGroups();
  $('#mList').innerHTML = state.rows.length
    ? groups.map((g) => `
      <section class="m-week">
        <div class="m-wk">${esc(typeof g.key === 'number' ? `${state.options.weekPrefix || ''}${g.key}`.trim() : (state.options.holidayLabel || '–'))}</div>
        <div class="m-rows">${g.rows.map(rowItem).join('')}</div>
      </section>`).join('')
    : `<div class="m-empty"><p>No activities yet.</p><button class="btn btn-primary" id="mGenerate">Generate meeting dates</button></div>`;
  $('#mGenerate')?.addEventListener('click', generateDates);
  const status = $('#fitStatus');
  $('#mFit').textContent = status.textContent;
  $('#mFit').className = status.className;
  // Keep an open editor in step (e.g. after Undo).
  panelStack.forEach((p) => p.refresh?.());
}

/* ---------------------------------------------------------------- panels */

function openPanel({ title, build, onClose, cls = '' }) {
  const host = $('#mPanels');
  host.hidden = false;
  panelStack.forEach((p) => { p.el.hidden = true; });
  const el = document.createElement('section');
  el.className = `m-panel ${cls}`;
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', title);
  el.innerHTML = `
    <header class="m-panel-head">
      <button class="m-head-btn" data-panel-back aria-label="${panelStack.length ? 'Back' : 'Close'}">
        <svg viewBox="0 0 24 24">${panelStack.length ? '<path d="m15 6-6 6 6 6"/>' : '<path d="M6 6l12 12M18 6 6 18"/>'}</svg>
      </button>
      <h2>${esc(title)}</h2>
      <button class="m-head-btn m-done" data-panel-done>Done</button>
    </header>
    <div class="m-panel-body"></div>`;
  host.appendChild(el);
  const entry = { el, onClose, body: el.querySelector('.m-panel-body') };
  panelStack.push(entry);
  el.querySelector('[data-panel-back]').onclick = () => closePanel();
  el.querySelector('[data-panel-done]').onclick = () => closeAllPanels();
  build(entry.body, entry);
  return entry;
}

function closePanel() {
  closePopover();
  const entry = panelStack.pop();
  if (!entry) return;
  entry.onClose?.();
  entry.el.remove();
  const top = panelStack[panelStack.length - 1];
  if (top) { top.el.hidden = false; top.refresh?.(); }
  else $('#mPanels').hidden = true;
  renderMobile();
}
function closeAllPanels() { while (panelStack.length) closePanel(); }

/* ---------------------------------------------------------------- menu & settings */

function openMenu() {
  openPanel({
    title: 'Menu',
    build(body) {
      const cards = $$('#sidebar details.card');
      const item = (attr, icon, label, sub = '') => `<button class="m-item" ${attr}><span class="card-icon">${icon}</span><span class="m-item-text">${label}${sub ? `<small>${sub}</small>` : ''}</span><svg class="m-chev" viewBox="0 0 24 24"><path d="m9 6 6 6-6 6"/></svg></button>`;
      body.innerHTML = `
        <div class="m-group">
          ${item('data-m="programs"', '<svg viewBox="0 0 24 24"><path d="M4 6h16M4 12h16M4 18h10"/></svg>', 'Programs', `${library.items.length} saved in this browser`)}
          ${item('data-m="new"', '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>', 'New program')}
          ${item('data-m="open"', '<svg viewBox="0 0 24 24"><path d="M12 15V3M7 8l5-5 5 5"/><path d="M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4"/></svg>', 'Open a file', 'Program (.json) or spreadsheet (.csv)')}
          ${item('data-m="generate"', '<svg viewBox="0 0 24 24"><path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/></svg>', 'Generate meeting dates')}
          ${undoStack.length ? item('data-m="undo"', '<svg viewBox="0 0 24 24"><path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/></svg>', 'Undo last change') : ''}
        </div>
        <div class="m-group-label">Settings</div>
        <div class="m-group">
          ${cards.map((c, i) => item(`data-card="${i}"`, c.querySelector('.card-icon').innerHTML, esc(c.querySelector('summary').textContent.trim()))).join('')}
        </div>
        <div class="m-group">
          ${item('data-m="desktop"', '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/></svg>', 'Use the desktop editor', 'Edit on the sheet itself')}
        </div>`;
      body.onclick = (e) => {
        const b = e.target.closest('[data-m], [data-card]');
        if (!b) return;
        if (b.dataset.card !== undefined) { openSettings(cards[+b.dataset.card]); return; }
        const m = b.dataset.m;
        if (m === 'programs') { closeAllPanels(); openProgramsMenu($('#mTitle')); }
        if (m === 'new') { closeAllPanels(); newProgram(); }
        if (m === 'open') { closeAllPanels(); importJson(); }
        if (m === 'generate') { closeAllPanels(); generateDates(); }
        if (m === 'undo') { undo(); closeAllPanels(); }
        if (m === 'desktop') { closeAllPanels(); setViewPref('desktop'); }
      };
    },
  });
}

/** Show one of the sidebar's settings sections on its own screen (the same controls, moved). */
function openSettings(card) {
  const content = card.querySelector('.card-body');
  const spot = document.createComment('settings');
  openPanel({
    title: card.querySelector('summary').textContent.trim(),
    cls: 'm-settings-panel',
    build(body) {
      body.classList.add('m-settings');
      content.replaceWith(spot);
      body.appendChild(content);
      syncInputs();
    },
    onClose() { spot.replaceWith(content); },
  });
}

/* ---------------------------------------------------------------- activity editor */

const FIELD_LABELS = { time: 'Time', activity: 'Activity', description: 'Description', uniform: 'Uniform', forms: 'Forms',
  where: 'Where', patrol: 'Duty patrol', leader: 'Leader', cost: 'Cost', challenge: 'Challenge area', notes: 'Notes' };

function chips(name, options, current, extra = '') {
  return `<div class="m-chips" data-chips="${name}">${options.map((o) => `<button class="m-chip ${o.value === current ? 'on' : ''}" data-v="${esc(o.value)}">${o.html}</button>`).join('')}${extra}</div>`;
}

function openEditor(id) {
  pushHistory();
  openPanel({
    title: 'Activity',
    cls: 'm-editor',
    build(body, entry) {
      const draw = () => {
        const r = rowById(id);
        if (!r) { closePanel(); return; }
        entry.el.querySelector('h2').textContent = r.noMeeting ? 'Week off' : 'Activity';
        body.innerHTML = editorHTML(r);
      };
      entry.refresh = draw;
      draw();
      wireEditor(body, id, draw);
    },
    onClose() { sortRows(); save(); renderDoc(); },
  });
}

function editorHTML(r) {
  const ws = rowWeekStart(r);
  const days = ws ? Array.from({ length: 7 }, (_, i) => addDays(ws, i)) : [];
  const wk = ws ? weekOf(toISO(ws)) ?? weekOf(toISO(addDays(ws, 6))) : null;
  const label = (k) => state.columns.find((c) => c.key === k)?.label || FIELD_LABELS[k];
  const cols = state.columns.filter((c) => c.visible && !['week', 'date'].includes(c.key)).map((c) => c.key);
  const datalists = { uniform: ['Yes', 'No', 'Camp', 'Full'], forms: ['-', 'C2G', 'MyScout', 'Event form'] };

  const field = (k) => {
    const v = r[k] || '';
    if (k === 'patrol') {
      const opts = state.patrols.filter((p) => p.name).map((p) => ({ value: p.name, html: `<span class="dot" style="background:${esc(p.color)}"></span>${esc(p.name)}` }));
      return `<div class="m-field"><span>${esc(label(k))}</span>${chips('patrol', [...opts, { value: '', html: 'None' }], v)}</div>`;
    }
    if (k === 'leader') {
      const { section, others } = leaderChoices();
      const opts = [...section, ...others].map((n) => ({ value: n, html: esc(n) }));
      const isOther = v && !section.includes(v) && !others.includes(v);
      return `<div class="m-field"><span>${esc(label(k))}</span>${chips('leader', [...opts, { value: '', html: 'None' }], v)}
        <input type="text" data-f="leader" class="m-other" placeholder="Other leader, e.g. Roo (Joeys)" value="${isOther ? esc(v) : ''}"></div>`;
    }
    if (k === 'challenge') {
      const opts = state.challenges.map((c) => ({ value: c.id, html: `${challengeIconOnly(c)}${esc(c.label)}` }));
      return `<div class="m-field"><span>${esc(label(k))}</span>${chips('challenge', [...opts, { value: '', html: 'None' }], v)}</div>`;
    }
    if (k === 'description' || k === 'notes' || k === 'time') {
      return `<label class="m-field"><span>${esc(label(k))}</span><textarea data-f="${k}" rows="${k === 'time' ? 2 : 3}" ${k === 'time' ? `placeholder="${esc(defaultTimeText())}"` : ''}>${esc(v)}</textarea></label>`;
    }
    const list = datalists[k] ? `<datalist id="dl-${k}">${datalists[k].map((x) => `<option value="${esc(x)}">`).join('')}</datalist>` : '';
    return `<label class="m-field"><span>${esc(label(k))}</span><input type="text" data-f="${k}" value="${esc(v)}" ${list ? `list="dl-${k}"` : ''}>${list}</label>`;
  };

  const up = movePlan(r.id, -1), down = movePlan(r.id, 1);
  return `
    <div class="m-card">
      <div class="m-field"><span>${wk ? `${esc(groupLabel({ key: wk }))} · ` : ''}Day</span>
        ${days.length ? `<div class="days">${days.map((d) => `<button class="day ${toISO(d) === r.date ? 'on' : ''}" data-day="${toISO(d)}"><b>${DAY_SHORT[d.getDay()]}</b><span>${d.getDate()}</span></button>`).join('')}</div>` : ''}
      </div>
      <div class="m-two">
        <label class="m-field"><span>Date</span><input type="date" data-f="date" value="${esc(r.date)}"></label>
        <label class="m-field"><span>Ends (optional)</span><input type="date" data-f="endDate" value="${esc(r.endDate)}"></label>
      </div>
      <label class="m-field"><span>Custom date text (optional)</span><input type="text" data-f="dateLabel" value="${esc(r.dateLabel)}" placeholder="e.g. Sat or Sun 7 or 8 Nov"></label>
      <label class="m-switch"><input type="checkbox" data-f="noMeeting" ${r.noMeeting ? 'checked' : ''}><span>No meeting this week</span></label>
    </div>
    ${r.noMeeting
    ? `<div class="m-card"><label class="m-field"><span>Text shown</span><input type="text" data-f="activity" value="${esc(r.activity)}" placeholder="No ${esc(state.branding.sectionName || 'meeting')} – Public holiday"></label></div>`
    : `<div class="m-card">${cols.map(field).join('')}</div>
      <div class="m-card"><div class="m-field"><span>Highlight</span>
        ${chips('category', [...state.categories.map((c) => ({ value: c.id, html: `<span class="dot" style="background:${esc(c.color)}"></span>${esc(c.label)}` })), { value: '', html: 'None' }], r.category)}
      </div></div>`}
    <div class="m-actions">
      <button class="btn btn-outline" data-act="add">Add another activity this week</button>
      <div class="m-two">
        <button class="btn btn-outline" data-act="up" ${up ? '' : 'disabled'}>${up ? `Move to ${esc(groupLabel({ key: up.wk }))}` : 'Move up a week'}</button>
        <button class="btn btn-outline" data-act="down" ${down ? '' : 'disabled'}>${down ? `Move to ${esc(groupLabel({ key: down.wk }))}` : 'Move down a week'}</button>
      </div>
      <div class="m-two">
        <button class="btn btn-outline" data-act="dup">Duplicate</button>
        <button class="btn btn-outline danger" data-act="del">Delete</button>
      </div>
    </div>`;
}

/** Attached once per editor; looks the row up each time so redraws never double up. */
function wireEditor(body, id, draw) {
  body.addEventListener('input', (e) => {
    const el = e.target.closest('[data-f]');
    const r = rowById(id);
    if (!el || !r) return;
    const f = el.dataset.f;
    if (f === 'noMeeting') {
      r.noMeeting = el.checked; r.autoHoliday = false;
      if (r.noMeeting && !r.activity.trim()) r.activity = `No ${state.branding.sectionName || 'meeting'} this week`;
      saveSoon(); draw(); return;
    }
    r[f] = el.value;
    r.autoHoliday = false;
    if (f === 'leader') body.querySelectorAll('[data-chips="leader"] .m-chip').forEach((c) => c.classList.toggle('on', c.dataset.v === el.value));
    if (f === 'date' || f === 'endDate') { if (f === 'date' && r.dateLabel && el.value) r.dateLabel = ''; saveSoon(); draw(); return; }
    saveSoon();
  });
  body.addEventListener('click', (e) => {
    const r = rowById(id);
    if (!r) return;
    const chip = e.target.closest('.m-chip');
    if (chip) {
      const key = chip.parentElement.dataset.chips;
      r[key] = chip.dataset.v;
      saveSoon(); draw(); return;
    }
    const day = e.target.closest('[data-day]');
    if (day) {
      const old = parseDate(r.date), next = day.dataset.day;
      if (r.endDate && old) r.endDate = toISO(addDays(parseDate(r.endDate), dayDiff(old, parseDate(next))));
      r.date = next; r.dateLabel = '';
      saveSoon(); draw(); return;
    }
    const act = e.target.closest('[data-act]');
    if (!act || act.disabled) return;
    const i = state.rows.indexOf(r);
    switch (act.dataset.act) {
      case 'add': {
        const n = newRow(r.date, { uniform: r.uniform });
        state.rows.splice(i + 1, 0, n);
        save(); renderDoc(); closePanel(); openEditor(n.id);
        return;
      }
      case 'up': moveRow(r.id, -1); break;
      case 'down': moveRow(r.id, 1); break;
      case 'dup': {
        const n = { ...clone(r), id: uid() };
        state.rows.splice(i + 1, 0, n);
        save(); renderDoc(); closePanel(); openEditor(n.id);
        toast('Duplicated — you are editing the copy.');
        return;
      }
      case 'del':
        state.rows.splice(i, 1);
        save(); closePanel();
        toast('Activity deleted. Undo is in the menu.');
        return;
      default: return;
    }
    save(); draw();
  });
}

/* ---------------------------------------------------------------- add, preview, share */

function openAddMenu() {
  openPanel({
    title: 'Add',
    cls: 'm-small',
    build(body) {
      body.innerHTML = `
        <div class="m-group">
          <button class="m-item" data-add="activity"><span class="card-icon"><svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg></span><span class="m-item-text">Activity<small>On the next free meeting night</small></span></button>
          <button class="m-item" data-add="off"><span class="card-icon"><svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M10 14l4 4M14 14l-4 4"/></svg></span><span class="m-item-text">Week off<small>Public holiday, school holidays…</small></span></button>
        </div>`;
      body.onclick = (e) => {
        const b = e.target.closest('[data-add]');
        if (!b) return;
        if (b.dataset.add === 'activity') {
          const used = new Set(state.rows.filter((x) => !isBlankRow(x)).map((x) => x.date));
          const blank = state.rows.find((x) => x.date && isBlankRow(x));
          if (blank && !used.has(blank.date)) { closeAllPanels(); openEditor(blank.id); return; }
          pushHistory();
          const last = [...state.rows].reverse().find((x) => x.date)?.date || '';
          const next = meetingDates().find((d) => d > last) || last;
          const n = newRow(next);
          state.rows.push(n);
          save(); renderDoc(); closeAllPanels(); openEditor(n.id);
        } else { closePanel(); openWeekOff(); }
      };
    },
  });
}

function openWeekOff() {
  const used = new Set(state.rows.map((r) => r.date));
  const firstFree = meetingDates().find((d) => !used.has(d)) || meetingDates()[0] || state.term.start || '';
  const section = state.branding.sectionName || 'meeting';
  const reasons = ['Public holiday', 'School holidays', 'No meeting this week'];
  const textFor = (reason) => (reason.startsWith('No meeting') ? `No ${section} this week` : `No ${section} – ${reason}`);
  openPanel({
    title: 'Add a week off',
    cls: 'm-small',
    build(body) {
      body.innerHTML = `
        <div class="m-card">
          <label class="m-field"><span>Date</span><input type="date" id="mOffDate" value="${esc(firstFree)}"></label>
          <div class="m-field"><span>Reason</span>${chips('reason', reasons.map((x) => ({ value: x, html: esc(x) })), reasons[0])}</div>
          <label class="m-field"><span>Text shown</span><input type="text" id="mOffText" value="${esc(textFor(reasons[0]))}"></label>
          <p class="hint">If there's an empty meeting row on that date, it's replaced.</p>
        </div>
        <div class="m-actions"><button class="btn btn-primary" id="mOffAdd">Add week off</button></div>`;
      body.querySelector('#mOffDate').addEventListener('input', (e) => {
        const h = publicHoliday(e.target.value);
        if (h) body.querySelector('#mOffText').value = weekOffText(h);
      });
      body.onclick = (e) => {
        const chip = e.target.closest('.m-chip');
        if (chip) {
          body.querySelectorAll('.m-chip').forEach((c) => c.classList.toggle('on', c === chip));
          body.querySelector('#mOffText').value = textFor(chip.dataset.v);
        }
        if (e.target.closest('#mOffAdd')) {
          addWeekOff(body.querySelector('#mOffDate').value, body.querySelector('#mOffText').value.trim() || `No ${section} this week`);
          closeAllPanels();
        }
      };
    },
  });
}

function showPreview(on) {
  closeAllPanels();
  document.body.classList.toggle('m-preview', on);
  renderDoc();
  window.scrollTo(0, 0);
}

function openShare() {
  openPanel({
    title: 'Share',
    cls: 'm-small',
    build(body) {
      const item = (key, icon, label, sub) => `<button class="m-item" data-share="${key}"><span class="card-icon">${icon}</span><span class="m-item-text">${label}<small>${sub}</small></span></button>`;
      const canShare = !!navigator.canShare;
      body.innerHTML = `
        <div class="m-group">
          ${item('print', '<svg viewBox="0 0 24 24"><path d="M6 9V3h12v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M6 14h12v7H6z"/></svg>', 'Print or save as PDF', 'From the print screen you can also send the PDF by email or message')}
        </div>
        <div class="m-group-label">${canShare ? 'Send a file' : 'Download a file'}</div>
        <div class="m-group">
          ${item('ics', '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>', 'Calendar for families', 'Adds every meeting to Google, Apple or Outlook calendars')}
          ${item('csv', '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M3 15h18M9 4v16"/></svg>', 'Activities spreadsheet', 'For other leaders to edit in Excel or Google Sheets')}
          ${item('json', '<svg viewBox="0 0 24 24"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6"/></svg>', 'Full program file', 'Everything, including branding and settings')}
        </div>`;
      body.onclick = (e) => {
        const b = e.target.closest('[data-share]');
        if (!b) return;
        const kind = b.dataset.share;
        if (kind === 'print') { closeAllPanels(); printProgram(); return; }
        shareFiles = true;   // send through the device's share menu where it has one
        try {
          if (kind === 'ics') exportCalendar();
          if (kind === 'csv') exportCsv();
          if (kind === 'json') exportJson();
        } finally { shareFiles = false; }
        closeAllPanels();
      };
    },
  });
}

/* ---------------------------------------------------------------- wiring */

function initMobile() {
  $('#mMenu').onclick = openMenu;
  $('#mTitle').onclick = (e) => openProgramsMenu(e.currentTarget);
  $('#mAdd').onclick = openAddMenu;
  $('#mPreview').onclick = () => showPreview(true);
  $('#mShare').onclick = openShare;
  $('#mBack').onclick = () => showPreview(false);
  $('#mShare2').onclick = openShare;
  $('#mList').addEventListener('click', (e) => {
    const row = e.target.closest('.m-row');
    if (row) openEditor(row.dataset.id);
  });
  $('#mPanels').addEventListener('click', (e) => { if (e.target.id === 'mPanels') closeAllPanels(); });
  $('#btnMobileView').onclick = () => setViewPref('mobile');
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && panelStack.length && $('#popover').hidden && $('#modal').hidden) closePanel();
  });
  smallScreen.addEventListener('change', applyView);
  applyView();
}

initMobile();
