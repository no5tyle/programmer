/*
 * First visit: a short setup wizard (group name, section, leaders), then a tour of the screen with
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
        <p>Make a one-page term program to share with your section's families. First, three quick questions so it's set up for you.</p>
        <label class="field"><span>Your Scout Group's name</span>
          <input type="text" id="wzGroup" value="${esc(draft.groupName)}" placeholder="e.g. 1st Example Scout Group" autocomplete="organization"></label>`,
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
              <img src="${esc(s.logo)}" alt="" width="40" height="40"><span>${esc(s.name)}</span>
            </button>`).join('')}
        </div>`,
      check: () => '',
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

/* ---------------------------------------------------------------- tour */

const TOUR_DESKTOP = [
  { target: ['#sidebar'], title: 'Settings', text: 'Your term dates, meeting night, branding and leaders are here. Open any section to change it.' },
  { target: ['#paper'], title: 'Your program', text: 'This is the page families get. Click any cell to type in it. Hover a row and use the ⋮ handle at its right-hand end to add, move, highlight or delete it.' },
  { target: ['#btnGenerate', '#btnAddRow', '#btnAddBreak'], title: 'Weeks and activities', text: 'Generate dates adds a row for every meeting night of the term. Add one-off activities, or a week off for a holiday.' },
  { target: ['#btnPrograms', '#btnNew'], title: 'Your programs', text: 'Programs save automatically in this browser. Find them under Programs, or start a New one for next term with the same branding.' },
  { target: ['#btnImport', '#btnExport', '#btnCalendar'], title: 'Files and calendars', text: 'Save a file to share with other leaders, and download a calendar families can add to their phones.' },
  { target: ['#btnPrint'], title: 'Print or PDF', text: 'When it\'s ready, print it or save a PDF to send to families.' },
];

const TOUR_MOBILE = [
  { target: ['#mList'], title: 'Your program', text: 'Each meeting night, week by week. Tap one to fill in its activity, leader and duty patrol.' },
  { target: ['#mAdd'], title: 'Add', text: 'Add an activity, or a week off for a holiday.' },
  { target: ['#mPreview'], title: 'Preview', text: 'See the page as families will.' },
  { target: ['#mShare'], title: 'Share', text: 'Send it as a PDF, add it to a calendar, or save a file for other leaders.' },
  { target: ['#mTitle'], title: 'Your programs', text: 'Programs save automatically. Tap the title to switch between them.' },
  { target: ['#mMenu'], title: 'Menu and settings', text: 'Term dates, branding, leaders and more. You can take this tour again from here.' },
];

let tour = null;

function startTour() {
  endTour();
  const mobile = document.body.classList.contains('mobile');
  if (mobile && document.body.classList.contains('m-preview')) showPreview(false);
  const steps = (mobile ? TOUR_MOBILE : TOUR_DESKTOP).filter((s) => s.target.some((sel) => visibleEl($(sel))));
  if (!steps.length) return;
  const layer = document.createElement('div');
  layer.className = 'tour-layer';
  layer.innerHTML = `<div class="tour-dim"></div><div class="tour-spot"></div>
    <div class="tour-tip" role="dialog" aria-live="polite" aria-labelledby="tourTitle"><span class="tour-arrow"></span><div class="tour-content"></div></div>`;
  document.body.appendChild(layer);
  tour = { steps, i: 0, layer, mobile, onMove: () => placeTour(), onKey: (e) => tourKey(e) };
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
  const pad = 6;
  const r = {
    left: Math.max(4, Math.min(...rects.map((x) => x.left)) - pad),
    top: Math.max(4, Math.min(...rects.map((x) => x.top)) - pad),
    right: Math.min(vw - 4, Math.max(...rects.map((x) => x.right)) + pad),
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

function endTour() {
  if (!tour) return;
  window.removeEventListener('resize', tour.onMove);
  window.removeEventListener('scroll', tour.onMove, true);
  document.removeEventListener('keydown', tour.onKey, true);
  tour.layer.remove();
  tour = null;
}

/* ---------------------------------------------------------------- start */

function initWelcome() {
  $('#btnTour').onclick = startTour;
  if (firstVisit && !welcomeState()) setWelcomeState('pending');
  if (welcomeState() === 'pending') openWelcome();
}

initWelcome();
