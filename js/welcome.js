/*
 * First visit: a short setup wizard (group name, section, term, leaders), then a tour of the screen with
 * tooltips. The tour can be taken again from the sidebar (desktop) or the menu (phone).
 * Uses the state, saving and rendering in js/app.js and the view switch in js/mobile.js.
 */
'use strict';

const WELCOME_KEY = 'scoutProgramBuilder.welcome';   // 'pending' until the wizard is finished or skipped

function welcomeState() { try { return localStorage.getItem(WELCOME_KEY); } catch { return null; } }
function setWelcomeState(v) { try { localStorage.setItem(WELCOME_KEY, v); } catch { /* this visit only */ } }

/* ---------------------------------------------------------------- setup wizard */

function openWelcome() {
  const b = state.branding;
  // The default leaders are placeholders: start the list empty rather than with "Leader name"
  const placeholder = (l) => l.name === 'Leader name' && l.phone === '0400 000 000';
  const draft = {
    groupName: b.groupName,
    section: SECTIONS[b.section] ? b.section : 'cubs',
    leaders: b.leaders.filter((l) => !placeholder(l)).map((l) => ({ ...l })),
  };
  if (!draft.leaders.length) draft.leaders.push({ name: '', phone: '' });
  draft.term = suggestedTerm();
  let step = 0;

  const back = document.createElement('div');
  back.className = 'wz-backdrop';
  back.innerHTML = '<div class="wz" role="dialog" aria-modal="true" aria-labelledby="wzTitle"></div>';
  document.body.appendChild(back);
  const box = back.firstElementChild;

  const steps = [
    {
      title: 'Welcome to Program Builder',
      body: () => `
        <p>Make a one-page term program to share with your section's families. First, four quick questions so it's set up for you.</p>
        <p class="hint">Your programs are saved in this browser only. To keep a copy or use another device, save a file (Save file on a computer; Share, then Full program file on a phone).</p>
        <label class="field"><span>Your Scout Group's name</span>
          <input type="text" id="wzGroup" value="${esc(draft.groupName)}" placeholder="e.g. 1st Example Scout Group"></label>`,
      check() {
        draft.groupName = $('#wzGroup').value.trim();
        return draft.groupName ? '' : 'Enter your group\'s name.';
      },
    },
    {
      title: 'Which section?',
      body: () => `
        <p>The section sets the program's title, colour and logo. You can change it later under <strong>Branding</strong>.</p>
        <div class="wz-sections" role="radiogroup" aria-label="Section">
          ${Object.entries(SECTIONS).map(([id, s]) => `
            <button type="button" class="wz-section ${draft.section === id ? 'on' : ''}" role="radio" aria-checked="${draft.section === id}" data-section="${id}" style="--sc:${esc(s.color)}">
              <img src="${esc(s.emblem || s.logo)}" alt="" width="40" height="40"><span>${esc(s.name)}</span>
            </button>`).join('')}
        </div>`,
      check: () => '',
    },
    {
      title: 'Which term?',
      body: () => {
        const t = draft.term;
        const thisYear = new Date().getFullYear();
        const years = Array.from({ length: 5 }, (_, i) => thisYear - 1 + i);
        if (!years.includes(t.year)) years.push(t.year);
        return `
        <p>Pick the term this program is for: its dates come from your state's school terms. Meeting nights are filled in for you.</p>
        <div class="wz-term">
          <label class="field wz-wide"><span>State or territory</span>
            <select data-wt="region">${REGIONS.map(([v, label]) => `<option value="${v}" ${v === t.region ? 'selected' : ''}>${esc(label)}</option>`).join('')}</select></label>
          <label class="field"><span>Year</span>
            <select data-wt="year">${years.sort().map((y) => `<option ${y === t.year ? 'selected' : ''}>${y}</option>`).join('')}</select></label>
          <label class="field"><span>Term</span>
            <select data-wt="term">${[1, 2, 3, 4].map((n) => `<option value="${n}" ${n === t.term ? 'selected' : ''}>Term ${n}</option>`).join('')}</select></label>
          <label class="field wz-wide"><span>Meeting night</span>
            <select data-wt="meetingDay">${[1, 2, 3, 4, 5, 6, 0].map((d) => `<option value="${d}" ${d === t.meetingDay ? 'selected' : ''}>${DAY_LONG[d]}</option>`).join('')}</select></label>
          <div class="wz-dates wz-wide" ${termPreset(t) ? 'hidden' : ''}>
            <label class="field"><span>Term starts</span><input type="date" data-wt="start" value="${esc(t.start)}"></label>
            <label class="field"><span>Term ends</span><input type="date" data-wt="end" value="${esc(t.end)}"></label>
          </div>
        </div>
        <p class="wz-summary" aria-live="polite">${termSummary(t)}</p>`;
      },
      check() {
        const t = draft.term;
        if (!t.start || !t.end) return 'Enter the term\'s first and last days.';
        if (t.end < t.start) return 'The term ends before it starts.';
        return '';
      },
    },
    {
      title: 'Who are the leaders?',
      body: () => `
        <p>Leaders' names go at the top of the program, and you can pick them for each activity. Contact details, like a phone number or email, are optional.</p>
        <div class="wz-leaders">
          ${draft.leaders.map((l, i) => `
            <div class="wz-leader">
              <input type="text" data-wl="${i}" data-f="name" value="${esc(l.name)}" placeholder="Leader name" aria-label="Leader ${i + 1} name">
              <input type="text" data-wl="${i}" data-f="phone" value="${esc(l.phone)}" placeholder="Contact" aria-label="Leader ${i + 1} contact (phone or email)">
              ${draft.leaders.length > 1 ? `<button type="button" class="icon-btn" data-wl-del="${i}" title="Remove" aria-label="Remove leader ${i + 1}"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button>` : ''}
            </div>`).join('')}
        </div>
        <button type="button" class="btn btn-text btn-sm" id="wzAddLeader">+ Add another leader</button>`,
      check() {
        readLeaders();
        return draft.leaders.some((l) => l.name.trim()) ? '' : 'Enter at least one leader\'s name.';
      },
    },
  ];

  /** Term fields changed: the preset dates follow region, year and term; the summary updates in place. */
  function readTerm(e) {
    const el = e.target.closest('[data-wt]');
    if (!el) return;
    const t = draft.term;
    const k = el.dataset.wt;
    t[k] = ['year', 'term', 'meetingDay'].includes(k) ? +el.value : el.value;
    if (['region', 'year', 'term'].includes(k)) {
      const preset = termPreset(t);
      if (preset) [t.start, t.end] = preset;
      const dates = $('.wz-dates', box);
      dates.hidden = !!preset;
      $('[data-wt="start"]', box).value = t.start;
      $('[data-wt="end"]', box).value = t.end;
    }
    $('.wz-summary', box).innerHTML = termSummary(t);
  }

  function readLeaders() {
    $$('[data-wl]', box).forEach((el) => { draft.leaders[+el.dataset.wl][el.dataset.f] = el.value; });
  }

  function render(focusFirst = true) {
    const s = steps[step];
    box.innerHTML = `
      <div class="wz-dots" aria-hidden="true">${steps.map((_, i) => `<span class="${i === step ? 'on' : i < step ? 'done' : ''}"></span>`).join('')}</div>
      <h2 id="wzTitle">${esc(s.title)}</h2>
      <div class="wz-body">${s.body()}</div>
      <p class="wz-error" role="alert"></p>
      <div class="wz-actions">
        ${step === 0 ? '<button type="button" class="btn btn-text" data-wz="skip">Skip setup</button>' : '<button type="button" class="btn btn-outline" data-wz="back">Back</button>'}
        <button type="button" class="btn btn-primary" data-wz="next">${step === steps.length - 1 ? 'Finish' : 'Next'}</button>
      </div>`;
    if (focusFirst) ($('input', box) || $('.wz-section.on', box) || $('[data-wz="next"]', box)).focus();
  }

  function next() {
    const problem = steps[step].check();
    if (problem) {
      $('.wz-error', box).textContent = problem;
      $('input:not([type=tel])', box)?.focus();
      return;
    }
    if (step < steps.length - 1) { step++; render(); return; }
    finish();
  }

  function finish() {
    pushHistory();
    const sec = SECTIONS[draft.section];
    state.branding.groupName = draft.groupName;
    state.branding.section = draft.section;
    state.branding.sectionName = sec.name;
    state.branding.color = sec.color;
    state.branding.titleColor = luminance(sec.color) < 0.45 ? 'auto' : 'dark';
    // The term: if nothing has been typed into the program yet, its meeting nights follow it
    Object.assign(state.term, draft.term);
    if (!rowsHaveContent()) state.rows = generateRows();
    state.branding.leaders = draft.leaders
      .map((l) => ({ name: l.name.trim(), phone: l.phone.trim() }))
      .filter((l) => l.name);
    // Rows that were generated with the old section's default stay as they are; only the branding changes.
    save();
    syncInputs();
    renderAll();
    close();
    setWelcomeState('done');
    // Wait for the sheet to lay out with the new branding before pointing at things
    setTimeout(startTour, 250);
  }

  function close() {
    document.removeEventListener('keydown', onKey, true);
    back.remove();
  }

  function onKey(e) {
    if (e.key === 'Enter' && e.target.closest?.('.wz') && e.target.tagName === 'INPUT') { e.preventDefault(); next(); }
    // Escape does nothing: Skip setup is the way out, so it isn't closed by accident
    if (e.key === 'Escape') e.stopPropagation();
  }
  document.addEventListener('keydown', onKey, true);

  box.addEventListener('change', readTerm);
  box.addEventListener('input', (e) => { if (e.target.type === 'date') readTerm(e); });
  box.addEventListener('click', (e) => {
    const sec = e.target.closest('[data-section]');
    if (sec) { draft.section = sec.dataset.section; render(false); $(`[data-section="${draft.section}"]`, box).focus(); return; }
    if (e.target.closest('#wzAddLeader')) {
      readLeaders();
      draft.leaders.push({ name: '', phone: '' });
      render(false);
      $$('[data-f="name"]', box).pop().focus();
      return;
    }
    const del = e.target.closest('[data-wl-del]');
    if (del) { readLeaders(); draft.leaders.splice(+del.dataset.wlDel, 1); render(false); return; }
    const act = e.target.closest('[data-wz]')?.dataset.wz;
    if (act === 'next') next();
    if (act === 'back') { if (step === 2) readLeaders(); step--; render(); }
    if (act === 'skip') { close(); setWelcomeState('done'); }
  });
  // Arrow keys move between sections, as in a radio group
  box.addEventListener('keydown', (e) => {
    const cur = e.target.closest('[data-section]');
    if (!cur || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
    e.preventDefault();
    const ids = Object.keys(SECTIONS);
    const i = ids.indexOf(cur.dataset.section) + (['ArrowLeft', 'ArrowUp'].includes(e.key) ? -1 : 1);
    draft.section = ids[(i + ids.length) % ids.length];
    render(false);
    $(`[data-section="${draft.section}"]`, box).focus();
  });

  render();
}

/* ---------------------------------------------------------------- term step */

/** A term's built-in [start, end], or null (custom region, or a year not in the app's dates). */
function termPreset(t) { return TERM_DATES[t.region]?.[t.year]?.[t.term - 1] || null; }

/** The term on now, or the next one, in the program's region (else the program's own term). */
function suggestedTerm() {
  const t = { region: state.term.region, year: state.term.year, term: state.term.term, meetingDay: state.term.meetingDay, start: state.term.start, end: state.term.end };
  const today = toISO(new Date());
  const thisYear = new Date().getFullYear();
  for (const year of [thisYear, thisYear + 1]) {
    const terms = TERM_DATES[t.region]?.[year] || [];
    const i = terms.findIndex(([, end]) => end >= today);
    if (i >= 0) return { ...t, year, term: i + 1, start: terms[i][0], end: terms[i][1] };
  }
  return t;
}

/** "12 Oct – 11 Dec 2026 · 9 Tuesday meetings" */
function termSummary(t) {
  const s = parseDate(t.start), e = parseDate(t.end);
  if (!s || !e || e < s) return termPreset(t) ? '' : 'This term\'s dates aren\'t built in: enter them above.';
  let n = 0;
  for (let d = addDays(s, (t.meetingDay - s.getDay() + 7) % 7); d <= e; d = addDays(d, 7)) n++;
  const day = (d) => `${d.getDate()} ${MONTH_SHORT[d.getMonth()]}`;
  return `<b>${day(s)} – ${day(e)} ${e.getFullYear()}</b> · ${n} ${esc(DAY_LONG[t.meetingDay])} meeting${n === 1 ? '' : 's'}`;
}

/* ---------------------------------------------------------------- tour */

const TOUR_DESKTOP = [
  { target: ['#sidebar'], title: 'Settings', text: 'Your term dates, meeting night, branding and leaders are here. Open any section to change it.' },
  { target: ['#paper'], title: 'Your program', text: 'This is the page families get. Click any cell to edit it: a toolbar above it sets bold, italic, colour and alignment. Click a Week cell to style the whole week. Use the ⋮ on a row\'s right-hand edge to add, move or delete it.' },
  // The + on a Week cell's left edge (it shows when the cell is hovered): shown, not clicked
  { target: ['#sheet .wk-add.tour-show'], title: 'Add to a week', text: 'The + on a Week cell\'s left edge (hover the cell to see it) adds an activity on any day of that week: pick the day, and it\'s added to the week.', always: true, enter: tourShowWeekAdd, leave: tourHideWeekAdd },
  // Shown on a row and opened by the person taking the tour (or by Next)
  { target: ['#rowHandle'], title: 'Row options', text: 'Each row has a ⋮ on its right-hand edge (hover a row to see it). Click this one to open its menu.', always: true, interactive: true, enter: tourShowHandle },
  { target: ['#popover'], title: 'The row menu', text: 'Add an activity on the same date, mark a week as no meeting (a public holiday or school holidays), duplicate a row, move it a week, highlight it, or delete it.', always: true, enter: tourOpenRowMenu, leave: tourCloseRowMenu },
  { target: ['#btnAddRow', '#btnAddWeek'], title: 'Weeks and activities', text: 'Add one-off activities, or a week before or after the term. Generate meeting dates (under Term & meeting night) fills in every meeting night. For a week off, use Mark as no meeting in the row\'s ⋮ menu.' },
  { target: ['#btnPrograms'], title: 'Your programs', text: 'Programs save automatically, in this browser only. Find them under Programs, which also starts a New one for next term with the same branding. To keep a copy or move to another device, use Save file.' },
  { target: ['#btnImport', '#btnSave'], padX: 1, title: 'Program files', text: 'Save file keeps the whole program as a file, to keep a copy, move to another device or share with other leaders. Open brings one back.' },
  { target: ['#btnExport'], title: 'Export', text: 'When it\'s ready, print it, or save a PDF to send to families, a spreadsheet of the activities, or a calendar families can add to their phones. The ? beside it brings this tour back.' },
];

const TOUR_MOBILE = [
  { target: ['#mList'], title: 'Your program', text: 'Each meeting night, week by week. Tap one to fill in its activity, leader and duty patrol. Its text fields have a toolbar for bold, colour and alignment; Aa styles the others.' },
  { target: ['#mAdd'], title: 'Add', text: 'Add an activity, a week off for a holiday, or a week before or after the term.' },
  { target: ['#mPreview'], title: 'Preview', text: 'See the page as families will.' },
  { target: ['#mShare'], title: 'Share', text: 'Send it as a PDF, add it to a calendar, or save a file for other leaders.' },
  { target: ['#mTitle'], title: 'Your programs', text: 'Programs save automatically, on this phone only. Tap the title to switch between them. To keep a copy or move to another device, use Share, then Full program file.' },
  { target: ['#mMenu'], title: 'Menu and settings', text: 'Term dates, branding, leaders and more. You can take this tour again from here.' },
];

let tour = null;

function startTour() {
  endTour();
  const mobile = document.body.classList.contains('mobile');
  if (mobile && document.body.classList.contains('m-preview')) showPreview(false);
  const steps = (mobile ? TOUR_MOBILE : TOUR_DESKTOP).filter((s) => s.always || s.target.some((sel) => visibleEl($(sel))));
  if (!steps.length) return;
  const layer = document.createElement('div');
  layer.className = 'tour-layer';
  layer.innerHTML = `<div class="tour-dim"></div><div class="tour-spot"></div><div class="tour-block"></div>
    <div class="tour-tip" role="dialog" aria-live="polite" aria-labelledby="tourTitle"><span class="tour-arrow"></span><div class="tour-content"></div></div>`;
  document.body.appendChild(layer);
  // Clicking the ⋮ on its step opens the menu (the app does that) and moves on to the menu
  const onHandle = () => { if (tour?.steps[tour.i].enter === tourShowHandle) setTimeout(() => tourGo(1), 0); };
  $('#rowHandle').addEventListener('click', onHandle);
  tour = { steps, i: 0, layer, mobile, onHandle, onMove: () => placeTour(), onKey: (e) => tourKey(e) };
  window.addEventListener('resize', tour.onMove);
  window.addEventListener('scroll', tour.onMove, true);
  document.addEventListener('keydown', tour.onKey, true);
  layer.addEventListener('click', (e) => {
    const act = e.target.closest('[data-tour]')?.dataset.tour;
    if (act === 'next') tourGo(1);
    if (act === 'back') tourGo(-1);
    if (act === 'end') endTour();
  });
  showTourStep();
}

function visibleEl(el) {
  if (!el) return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
}

function tourGo(d) {
  const i = tour.i + d;
  if (i < 0) return;
  tour.steps[tour.i].leave?.();
  if (i >= tour.steps.length) { endTour(); return; }
  tour.i = i;
  showTourStep();
}

function tourKey(e) {
  if (!tour) return;
  if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); endTour(); }
  if (e.key === 'ArrowRight') { e.preventDefault(); tourGo(1); }
  if (e.key === 'ArrowLeft') { e.preventDefault(); tourGo(-1); }
}

function showTourStep() {
  const { steps, i, layer } = tour;
  const s = steps[i];
  const last = i === steps.length - 1;
  s.enter?.();
  layer.classList.toggle('interactive', !!s.interactive);
  $('.tour-content', layer).innerHTML = `
    <div class="tour-count">${i + 1} of ${steps.length}</div>
    <h3 id="tourTitle">${esc(s.title)}</h3>
    <p>${esc(s.text)}</p>
    <div class="tour-actions">
      ${last ? '' : '<button type="button" class="btn btn-text btn-sm" data-tour="end">Skip tour</button>'}
      <span class="tour-gap"></span>
      ${i ? '<button type="button" class="btn btn-outline btn-sm" data-tour="back">Back</button>' : ''}
      <button type="button" class="btn btn-primary btn-sm" data-tour="next">${last ? 'Done' : 'Next'}</button>
    </div>`;
  // Bring the target into view (the sidebar and sheet scroll on their own)
  $(s.target[0])?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  placeTour();
  $('[data-tour="next"]', layer).focus({ preventScroll: true });
}

/** The area the step points at: its targets together, kept on screen */
function tourRect(s) {
  const rects = s.target.map((sel) => $(sel)).filter(visibleEl).map((el) => el.getBoundingClientRect());
  const vw = window.innerWidth; const vh = window.innerHeight;
  // Room around the target; a step can have less at the sides (padX), e.g. where a neighbour is close
  const pad = 6, padX = s.padX ?? pad;
  const r = {
    left: Math.max(4, Math.min(...rects.map((x) => x.left)) - padX),
    top: Math.max(4, Math.min(...rects.map((x) => x.top)) - pad),
    right: Math.min(vw - 4, Math.max(...rects.map((x) => x.right)) + padX),
    bottom: Math.min(vh - 4, Math.max(...rects.map((x) => x.bottom)) + pad),
  };
  r.width = Math.max(0, r.right - r.left); r.height = Math.max(0, r.bottom - r.top);
  return r;
}

function placeTour() {
  if (!tour) return;
  // The view changed under the tour (the window crossed into the phone layout): stop rather than point at nothing
  if (document.body.classList.contains('mobile') !== tour.mobile) { endTour(); return; }
  const s = tour.steps[tour.i];
  const spot = $('.tour-spot', tour.layer);
  const tip = $('.tour-tip', tour.layer);
  const arrow = $('.tour-arrow', tour.layer);
  const r = tourRect(s);
  Object.assign(spot.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
  $('.tour-dim', tour.layer).style.clipPath = holePath(r, window.innerWidth, window.innerHeight);

  const vw = window.innerWidth; const vh = window.innerHeight;
  const gap = 12; const edge = 12;
  tip.style.width = `${Math.min(320, vw - 2 * edge)}px`;
  const w = tip.offsetWidth; const h = tip.offsetHeight;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(v, hi));
  const cx = r.left + r.width / 2; const cy = r.top + r.height / 2;
  let side; let left; let top;
  if (r.bottom + gap + h <= vh - edge) { side = 'below'; top = r.bottom + gap; left = clamp(cx - w / 2, edge, vw - w - edge); }
  else if (r.top - gap - h >= edge) { side = 'above'; top = r.top - gap - h; left = clamp(cx - w / 2, edge, vw - w - edge); }
  else if (r.right + gap + w <= vw - edge) { side = 'right'; left = r.right + gap; top = clamp(cy - h / 2, edge, vh - h - edge); }
  else if (r.left - gap - w >= edge) { side = 'left'; left = r.left - gap - w; top = clamp(cy - h / 2, edge, vh - h - edge); }
  else { side = 'inside'; left = clamp(cx - w / 2, edge, vw - w - edge); top = clamp(r.top + 24, edge, vh - h - edge); }
  tip.dataset.side = side;
  Object.assign(tip.style, { left: `${left}px`, top: `${top}px` });
  // Point the arrow at the middle of the target
  if (side === 'below' || side === 'above') arrow.style.cssText = `left:${clamp(cx - left, 18, w - 18)}px`;
  else if (side === 'left' || side === 'right') arrow.style.cssText = `top:${clamp(cy - top, 18, h - 18)}px`;
}

/** A clip-path covering the screen except a rounded hole over r */
function holePath(r, vw, vh) {
  const k = Math.min(12, r.width / 2, r.height / 2);
  const { left: x, top: y, right: x2, bottom: y2 } = r;
  return `path(evenodd, 'M0 0H${vw}V${vh}H0Z M${x + k} ${y}H${x2 - k}A${k} ${k} 0 0 1 ${x2} ${y + k}V${y2 - k}A${k} ${k} 0 0 1 ${x2 - k} ${y2}H${x + k}A${k} ${k} 0 0 1 ${x} ${y2 - k}V${y + k}A${k} ${k} 0 0 1 ${x + k} ${y}Z')`;
}

/** The Row options step: a row's ⋮ showing (on the second row, if there is one), kept showing. */
function tourShowHandle() {
  if (!pop.hidden) closePopover();
  const rows = $$('#sheet tbody tr[data-id]');
  const tr = rows[1] || rows[0];
  if (!tr) return;
  tr.scrollIntoView({ block: 'nearest' });
  document.body.classList.remove('tour-handle');
  showHandle(tr);
  document.body.classList.add('tour-handle');
}

/** The row menu step: its menu open (Next on the step before opens it, as clicking the ⋮ does). */
function tourOpenRowMenu() {
  if (handle.hidden) tourShowHandle();
  if (pop.hidden || popCtx?.type !== 'row') openRowMenu(handle, handleRow);
}

function tourCloseRowMenu() { if (!pop.hidden) closePopover(); }

/** The Add to a week step: a Week cell's + showing (the second week's, if there is one). */
function tourShowWeekAdd() {
  tourHideWeekAdd();
  const adds = $$('#sheet td.c-week .wk-add');
  const add = adds[1] || adds[0];
  if (!add) return;
  add.closest('td').scrollIntoView({ block: 'nearest' });
  add.classList.add('tour-show');
}

function tourHideWeekAdd() { $$('#sheet .wk-add.tour-show').forEach((el) => el.classList.remove('tour-show')); }

function endTour() {
  if (!tour) return;
  tour.steps[tour.i]?.leave?.();
  $('#rowHandle').removeEventListener('click', tour.onHandle);
  document.body.classList.remove('tour-handle');
  hideHandle();
  window.removeEventListener('resize', tour.onMove);
  window.removeEventListener('scroll', tour.onMove, true);
  document.removeEventListener('keydown', tour.onKey, true);
  tour.layer.remove();
  tour = null;
}

/* ---------------------------------------------------------------- start */

function initWelcome() {
  $('#btnTour').onclick = startTour;
  $('#btnHelp').onclick = startTour;   // the ? beside Export
  if (firstVisit && !welcomeState()) setWelcomeState('pending');
  if (welcomeState() === 'pending') openWelcome();
}

initWelcome();
