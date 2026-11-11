// Shared helpers for the tests.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

/** Load js/data.js outside the browser (term dates, holiday rules). */
function loadData() {
  const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'data.js'), 'utf8').replace("'use strict';", '');
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(`${src}\n;Object.assign(this, { TERM_DATES, PUBLIC_HOLIDAYS, REGIONS, saPublicHolidays, auPublicHolidays, SECTIONS });`, ctx);
  return ctx;
}

/** Open the app and wait until it has rendered. */
async function openApp(page) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('/');
  await page.waitForFunction(() => typeof state === 'object' && document.querySelector('#fitStatus')?.textContent !== '—');
  return errors;
}

/** Fill a program much like a real Cubs term. */
async function fillCubs(page) {
  await page.evaluate(() => {
    const acts = ['Night Walk', 'Knots and Pioneering', 'OAS Catchup and Investing', 'Acting Games and Skits',
      'Learning to Draw from Life', 'Compasses and Navigation', 'Navigation Around Town', 'Games at the Block', 'Gingerbread Camps'];
    state.branding.groupName = '1st Example Scout Group';
    state.branding.leaders = [{ name: 'Plover', phone: '0400 000 001' }, { name: 'Baloo', phone: '0400 000 002' }, { name: 'Misia', phone: '0400 000 003' }];
    state.rows.forEach((r, i) => {
      r.activity = acts[i] || 'Activity';
      r.description = 'Walk with Baloo to a nearby park and back again.';
      r.challenge = ['outdoors', 'creative', 'community', 'personal'][i % 4];
      r.category = i % 2 ? 'hall' : 'out';
    });
    renderAll();
  });
}

/** Number of pages in a PDF buffer. */
function pdfPages(buf) {
  return (buf.toString('latin1').match(/\/Type\s*\/Page(?![s\w])/g) || []).length;
}

/** Width and height (points) of the first page of a PDF buffer. */
function pdfPageSize(buf) {
  const m = /\/MediaBox\s*\[\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\]/.exec(buf.toString('latin1'));
  return m ? [+m[3] - +m[1], +m[4] - +m[2]] : null;
}

module.exports = { loadData, openApp, fillCubs, pdfPages, pdfPageSize };
