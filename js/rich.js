/*
 * Text formatting: bold, italic, underline and red within a free-text field, set from a small toolbar
 * that hovers above the field (or the selected text) while it's being edited.
 *
 * A row keeps each field's plain text where it always has (row.activity, row.description, ...), so the
 * calendar file, the spreadsheet, sorting and the phone list are unchanged. Only a field that has
 * formatting also has row.rich[key]: the same text as a small, cleaned subset of HTML (<b>, <i>, <u>,
 * <span class="r"> and <br>). It's used only while its text still matches the plain text, so a field
 * changed some other way (a spreadsheet, an older copy of the app) simply shows unformatted.
 *
 * Fields with formatting are contenteditable elements marked [data-rich]. Loaded before js/app.js.
 */
'use strict';

const RICH_RED = '#d0021b';

const richEsc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** True for a colour that reads as red ("#d0021b", "rgb(208, 2, 27)", "red"). */
function isRedColour(c) {
  if (!c) return false;
  if (/^red$/i.test(c.trim())) return true;
  let m = /^#([0-9a-f]{6})$/i.exec(c.trim());
  let rgb = m ? [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16)) : null;
  if (!rgb) { m = /^#([0-9a-f]{3})$/i.exec(c.trim()); if (m) rgb = [...m[1]].map((x) => parseInt(x + x, 16)); }
  if (!rgb) { m = /rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/i.exec(c); if (m) rgb = [+m[1], +m[2], +m[3]]; }
  return !!rgb && rgb[0] >= 150 && rgb[1] < 100 && rgb[2] < 100;
}

/**
 * Any HTML (an edited field, or a loaded file) reduced to the allowed formatting. Text is escaped and
 * everything else (other tags, attributes, scripts, links, images) is dropped, keeping its text.
 */
function cleanRich(html) {
  const t = document.createElement('template');
  t.innerHTML = String(html ?? '');
  const walk = (parent) => [...parent.childNodes].map((n, i) => {
    if (n.nodeType === 3) return richEsc(n.nodeValue);
    if (n.nodeType !== 1) return '';
    const tag = n.tagName;
    if (tag === 'BR') return '<br>';
    if (['SCRIPT', 'STYLE', 'TEMPLATE'].includes(tag)) return '';
    let inner = walk(n);
    const st = n.style || {};
    const bold = tag === 'B' || tag === 'STRONG' || st.fontWeight === 'bold' || +st.fontWeight >= 600;
    const italic = tag === 'I' || tag === 'EM' || st.fontStyle === 'italic';
    const under = tag === 'U' || /underline/.test(`${st.textDecoration || ''} ${st.textDecorationLine || ''}`);
    const red = n.classList?.contains('r') || isRedColour(n.getAttribute('color')) || isRedColour(st.color);
    if (under) inner = `<u>${inner}</u>`;
    if (italic) inner = `<i>${inner}</i>`;
    if (bold) inner = `<b>${inner}</b>`;
    if (red) inner = `<span class="r">${inner}</span>`;
    // A new line inside the field is a <div> or <p> in some browsers
    if ((tag === 'DIV' || tag === 'P') && i > 0) inner = `<br>${inner}`;
    return inner;
  }).join('');
  return walk(t.content)
    .replace(/<(b|i|u)><\/\1>/g, '')
    .replace(/<span class="r"><\/span>/g, '');
}

/** The plain text of cleaned rich text (line breaks as \n). */
function richToText(html) {
  const t = document.createElement('template');
  t.innerHTML = String(html ?? '').replace(/<br>/g, '\n');
  return t.content.textContent;
}

const hasFormatting = (html) => /<(b|i|u|span)\b/.test(html || '');

/** A field's contents as HTML for the page: its formatting if it still matches the plain text, else the text. */
function richHTML(row, key) {
  const text = row[key] ?? '';
  const rich = row.rich?.[key];
  if (rich && richToText(rich) === text) return cleanRich(rich);
  return richEsc(text);
}

/** Read an edited field into the row: its plain text, and its formatting if it has any. */
function readRichField(row, key, el) {
  const html = cleanRich(el.innerHTML).replace(/(<br>)+$/, '');
  const text = richToText(html);
  row[key] = text;
  if (hasFormatting(html)) row.rich = { ...(row.rich || {}), [key]: html };
  else if (row.rich?.[key] !== undefined) { const { [key]: _gone, ...rest } = row.rich; row.rich = rest; }
  return text;
}

/** Formatting saved in a file, checked and cleaned when it's loaded. */
function normaliseRich(rich) {
  if (!rich || typeof rich !== 'object' || Array.isArray(rich)) return {};
  const out = {};
  Object.entries(rich).forEach(([k, v]) => { if (typeof v === 'string' && hasFormatting(cleanRich(v))) out[k] = cleanRich(v); });
  return out;
}

/* ---------------------------------------------------------------- the toolbar */

const FMT_BUTTONS = [
  { cmd: 'bold', label: 'Bold', key: 'B', html: '<b>B</b>' },
  { cmd: 'italic', label: 'Italic', key: 'I', html: '<i>I</i>' },
  { cmd: 'underline', label: 'Underline', key: 'U', html: '<u>U</u>' },
  { cmd: 'red', label: 'Red text', html: '<span class="fmt-red">A</span>' },
  { cmd: 'clear', label: 'Clear formatting', html: '<svg viewBox="0 0 24 24"><path d="M6 5h11M11 5l-3 14M4 20l16-16"/></svg>' },
];

const fmtBar = document.createElement('div');
fmtBar.className = 'fmt-bar';
fmtBar.setAttribute('role', 'toolbar');
fmtBar.setAttribute('aria-label', 'Text formatting');
fmtBar.hidden = true;
fmtBar.innerHTML = FMT_BUTTONS.map((b) => `<button type="button" data-fmt="${b.cmd}" title="${b.label}${b.key ? ` (${/Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl+'}${b.key})` : ''}" aria-label="${b.label}" aria-pressed="false">${b.html}</button>`).join('');

/** The formatted field being edited, if any. */
function richField() {
  const el = document.activeElement;
  return el && el.matches?.('[data-rich][contenteditable="true"]') ? el : null;
}

function selectionIsRed() {
  const sel = getSelection();
  let n = sel.rangeCount ? sel.getRangeAt(0).startContainer : null;
  if (n && n.nodeType === 3) n = n.parentElement;
  return !!n && isRedColour(getComputedStyle(n).color) && !isRedColour(getComputedStyle(richField() || document.body).color);
}

function placeFmtBar() {
  const field = richField();
  if (!field) { fmtBar.hidden = true; return; }
  fmtBar.hidden = false;
  // Above the whole field, so it never covers what's being edited; lined up with the selected text if
  // there is some, else with the field
  const sel = getSelection();
  const r = field.getBoundingClientRect();
  let cx = r.left + r.width / 2;
  if (sel.rangeCount && !sel.isCollapsed && field.contains(sel.anchorNode)) {
    const sr = sel.getRangeAt(0).getBoundingClientRect();
    if (sr.width || sr.height) cx = sr.left + sr.width / 2;
  }
  const w = fmtBar.offsetWidth, h = fmtBar.offsetHeight, gap = 6;
  const vv = window.visualViewport;
  const top0 = vv ? vv.offsetTop : 0, vh = vv ? vv.height : innerHeight;
  let top = r.top - h - gap;
  if (top < top0 + 4) top = r.bottom + gap;             // no room above: below instead
  top = Math.min(top, top0 + vh - h - 4);
  const left = Math.max(8, Math.min(cx - w / 2, innerWidth - w - 8));
  fmtBar.style.top = `${top}px`;
  fmtBar.style.left = `${left}px`;
  FMT_BUTTONS.forEach((b) => {
    const on = b.cmd === 'red' ? selectionIsRed() : b.cmd === 'clear' ? false : document.queryCommandState(b.cmd);
    fmtBar.querySelector(`[data-fmt="${b.cmd}"]`).setAttribute('aria-pressed', on ? 'true' : 'false');
  });
}

function applyFmt(cmd) {
  const field = richField();
  if (!field) return;
  document.execCommand('styleWithCSS', false, false);
  if (cmd === 'clear') document.execCommand('removeFormat');
  else if (cmd === 'red') document.execCommand('foreColor', false, selectionIsRed() ? getComputedStyle(field).color : RICH_RED);
  else document.execCommand(cmd);
  placeFmtBar();
}

// Pressing a button mustn't move the focus out of the field (that would lose the selection)
fmtBar.addEventListener('pointerdown', (e) => e.preventDefault());
fmtBar.addEventListener('mousedown', (e) => e.preventDefault());
fmtBar.addEventListener('click', (e) => {
  const b = e.target.closest('[data-fmt]');
  if (b) applyFmt(b.dataset.fmt);
});

document.addEventListener('selectionchange', placeFmtBar);
document.addEventListener('focusin', placeFmtBar);
document.addEventListener('focusout', () => setTimeout(placeFmtBar, 0));
document.addEventListener('input', (e) => { if (e.target.closest?.('[data-rich]')) placeFmtBar(); });
window.addEventListener('resize', placeFmtBar);
window.addEventListener('scroll', placeFmtBar, true);
window.visualViewport?.addEventListener('resize', placeFmtBar);
window.visualViewport?.addEventListener('scroll', placeFmtBar);

// Enter is a line break (as in the plain fields), not a new <div>; pasted text comes in plain
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' || !richField() || e.isComposing) return;
  e.preventDefault();
  document.execCommand('insertLineBreak');
}, true);
document.addEventListener('paste', (e) => {
  if (!richField()) return;
  e.preventDefault();
  document.execCommand('insertText', false, (e.clipboardData || window.clipboardData).getData('text/plain'));
}, true);

document.addEventListener('DOMContentLoaded', () => document.body.appendChild(fmtBar));
if (document.body) document.body.appendChild(fmtBar);
