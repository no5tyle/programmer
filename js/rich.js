/*
 * Text formatting: bold, italic, underline and red within a free-text field, set from a small toolbar
 * that hovers above the field (or the selected text) while it's being edited.
 *
 * A row keeps each field's plain text where it always has (row.activity, row.description, ...), so the
 * calendar file, the spreadsheet, sorting and the phone list are unchanged. Only a field that has
 * formatting also has row.rich[key]: the same text as a small, cleaned subset of HTML (<b>, <i>, <u>,
 * a colour as <span class="r|co|cg|cb|cp"> (TEXT_COLOURS) and <br>). It's used only while its text still matches the plain text, so a field
 * changed some other way (a spreadsheet, an older copy of the app) simply shows unformatted.
 *
 * Fields with formatting are contenteditable elements marked [data-rich]. Loaded before js/app.js.
 */
'use strict';

/** The text colours, for formatted text (a span's class) and whole-field styles. Red's class is "r", as it always was. */
const TEXT_COLOURS = [
  { hex: '#d0021b', name: 'Red', cls: 'r' },
  { hex: '#d9480f', name: 'Orange', cls: 'co' },
  { hex: '#1e8e3e', name: 'Green', cls: 'cg' },
  { hex: '#0060df', name: 'Blue', cls: 'cb' },
  { hex: '#6f42c1', name: 'Purple', cls: 'cp' },
];
const TEXT_COLOUR_CLASSES = TEXT_COLOURS.map((c) => c.cls);

const richEsc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** [r, g, b] of "#d0021b", "#d02", "rgb(208, 2, 27)" or "red"; else null. */
function parseRgb(c) {
  if (!c) return null;
  c = String(c).trim();
  if (/^red$/i.test(c)) return [255, 0, 0];
  let m = /^#([0-9a-f]{6})$/i.exec(c);
  if (m) return [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16));
  m = /^#([0-9a-f]{3})$/i.exec(c);
  if (m) return [...m[1]].map((x) => parseInt(x + x, 16));
  m = /rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/i.exec(c);
  return m ? [+m[1], +m[2], +m[3]] : null;
}

/** Which of TEXT_COLOURS a colour is (the nearest, if it's close), or null; any strong red counts as red. */
function textColourOf(c) {
  const rgb = parseRgb(c);
  if (!rgb) return null;
  let best = null, dist = Infinity;
  TEXT_COLOURS.forEach((tc) => {
    const d = parseRgb(tc.hex).reduce((a, v, i) => a + Math.abs(v - rgb[i]), 0);
    if (d < dist) { dist = d; best = tc; }
  });
  if (dist <= 60) return best;
  return rgb[0] >= 150 && rgb[1] < 100 && rgb[2] < 100 ? TEXT_COLOURS[0] : null;
}

/** True for a colour that reads as red ("#d0021b", "rgb(208, 2, 27)", "red"). */
function isRedColour(c) { return textColourOf(c)?.cls === 'r'; }

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
    const colour = TEXT_COLOURS.find((tc) => n.classList?.contains(tc.cls))
      || textColourOf(n.getAttribute('color')) || textColourOf(st.color);
    if (under) inner = `<u>${inner}</u>`;
    if (italic) inner = `<i>${inner}</i>`;
    if (bold) inner = `<b>${inner}</b>`;
    if (colour) inner = `<span class="${colour.cls}">${inner}</span>`;
    // A new line inside the field is a <div> or <p> in some browsers
    if ((tag === 'DIV' || tag === 'P') && i > 0) inner = `<br>${inner}`;
    return inner;
  }).join('');
  return walk(t.content)
    .replace(/<(b|i|u)><\/\1>/g, '')
    .replace(new RegExp(`<span class="(${TEXT_COLOUR_CLASSES.join('|')})"></span>`, 'g'), '');
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

const ALIGN_ICONS = {
  left: '<svg viewBox="0 0 24 24"><path d="M4 6h16M4 10h10M4 14h16M4 18h10"/></svg>',
  center: '<svg viewBox="0 0 24 24"><path d="M4 6h16M7 10h10M4 14h16M7 18h10"/></svg>',
  right: '<svg viewBox="0 0 24 24"><path d="M4 6h16M10 10h10M4 14h16M10 18h10"/></svg>',
};
const ALIGN_NAMES = { left: 'Align left', center: 'Centre', right: 'Align right' };

const FMT_BUTTONS = [
  { cmd: 'bold', label: 'Bold', key: 'B', html: '<b>B</b>' },
  { cmd: 'italic', label: 'Italic', key: 'I', html: '<i>I</i>' },
  { cmd: 'underline', label: 'Underline', key: 'U', html: '<u>U</u>' },
  { sep: true },
  ...TEXT_COLOURS.map((c) => ({ cmd: 'colour', colour: c.hex, label: `${c.name} text`, cls: 'fs-swatch', html: `<span style="background:${c.hex}"></span>` })),
  { sep: true, group: 'align' },
  // The whole cell's alignment (program cells and the phone editor's fields)
  ...['left', 'center', 'right'].map((a) => ({ cmd: 'align', al: a, label: ALIGN_NAMES[a], group: 'align', html: ALIGN_ICONS[a] })),
  { sep: true },
  { cmd: 'clear', label: 'Clear formatting', html: '<svg viewBox="0 0 24 24"><path d="M6 5h11M11 5l-3 14M4 20l16-16"/></svg>' },
];

const fmtBar = document.createElement('div');
fmtBar.className = 'fmt-bar';
fmtBar.setAttribute('role', 'toolbar');
fmtBar.setAttribute('aria-label', 'Text formatting');
fmtBar.hidden = true;
fmtBar.innerHTML = FMT_BUTTONS.map((b) => (b.sep ? `<span class="fs-sep" aria-hidden="true"${b.group ? ` data-group="${b.group}"` : ''}></span>`
  : `<button type="button" data-fmt="${b.cmd}"${b.colour ? ` data-colour="${b.colour}"` : ''}${b.al ? ` data-al="${b.al}"` : ''}${b.group ? ` data-group="${b.group}"` : ''}${b.cls ? ` class="${b.cls}"` : ''} title="${b.label}${b.key ? ` (${/Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl+'}${b.key})` : ''}" aria-label="${b.label}" aria-pressed="false">${b.html}</button>`)).join('');

/** The row and key of a typed field (a program cell, or a phone editor field), for its alignment; or null. */
function richFieldCell(field) {
  const rowId = field.closest('tr[data-id]')?.dataset.id || field.dataset.row;
  const key = field.dataset.key || field.dataset.f;
  return rowId && key && typeof typedCellAlign === 'function' && typedCellAlign(rowId, key) ? { rowId, key } : null;
}

/** The formatted field being edited, if any. */
function richField() {
  const el = document.activeElement;
  return el && el.matches?.('[data-rich][contenteditable="true"]') ? el : null;
}

/** The text colour (TEXT_COLOURS) where the selection starts, if it isn't just the field's own colour. */
function selectionColour() {
  const sel = getSelection();
  let n = sel.rangeCount ? sel.getRangeAt(0).startContainer : null;
  if (n && n.nodeType === 3) n = n.parentElement;
  if (!n) return null;
  const c = textColourOf(getComputedStyle(n).color);
  return c && c !== textColourOf(getComputedStyle(richField() || document.body).color) ? c : null;
}

function placeFmtBar() {
  const field = richField();
  if (!field) { fmtBar.hidden = true; return; }
  fmtBar.hidden = false;
  // Above the field, lined up with its left edge, as the style toolbar is for other fields (placeFsBar).
  // On the program that's the whole table cell, not the text inside its padding.
  const r = (field.closest('.prog td') || field).getBoundingClientRect();
  const w = fmtBar.offsetWidth, h = fmtBar.offsetHeight, gap = 6;
  const vv = window.visualViewport;
  const top0 = vv ? vv.offsetTop : 0, vh = vv ? vv.height : innerHeight;
  let top = r.top - h - gap;
  if (top < top0 + 4) top = r.bottom + gap;             // no room above: below instead
  top = Math.min(top, top0 + vh - h - 4);
  const left = Math.max(8, Math.min(r.left, innerWidth - w - 8));
  fmtBar.style.top = `${top}px`;
  fmtBar.style.left = `${left}px`;
  const colour = selectionColour();
  const cell = richFieldCell(field);
  const align = cell ? typedCellAlign(cell.rowId, cell.key) : null;
  fmtBar.querySelectorAll('[data-group="align"]').forEach((el) => { el.hidden = !cell; });
  fmtBar.querySelectorAll('[data-fmt]').forEach((el) => {
    const cmd = el.dataset.fmt;
    const on = cmd === 'colour' ? colour?.hex === el.dataset.colour : cmd === 'align' ? el.dataset.al === align
      : cmd === 'clear' ? false : document.queryCommandState(cmd);
    el.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
}

function applyFmt(cmd, colour, al) {
  const field = richField();
  if (!field) return;
  if (cmd === 'align') {
    const cell = richFieldCell(field);
    if (cell) alignTypedCell(cell.rowId, cell.key, al);
    placeFmtBar();
    return;
  }
  document.execCommand('styleWithCSS', false, false);
  if (cmd === 'clear') document.execCommand('removeFormat');
  // A colour; the same colour again goes back to the field's own
  else if (cmd === 'colour') document.execCommand('foreColor', false, selectionColour()?.hex === colour ? getComputedStyle(field).color : colour);
  else document.execCommand(cmd);
  placeFmtBar();
}

// Pressing a button mustn't move the focus out of the field (that would lose the selection)
fmtBar.addEventListener('pointerdown', (e) => e.preventDefault());
fmtBar.addEventListener('mousedown', (e) => e.preventDefault());
fmtBar.addEventListener('click', (e) => {
  const b = e.target.closest('[data-fmt]');
  if (b) applyFmt(b.dataset.fmt, b.dataset.colour, b.dataset.al);
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

/* ---------------------------------------------------------------- whole-field styles */

/*
 * The sidebar's text fields that print take a smaller set: bold, italic and a colour, for the whole
 * field. Their toolbar hovers above the field the same way. The fields are marked [data-fs] and their
 * styles kept by js/app.js (fieldStyleRef, previewFieldStyles).
 */
const fsBar = document.createElement('div');
fsBar.className = 'fmt-bar fs-bar';
fsBar.setAttribute('role', 'toolbar');
fsBar.setAttribute('aria-label', 'Field style');
fsBar.hidden = true;

function drawFsBar() {
  const colours = typeof FIELD_COLOURS === 'undefined' ? [] : FIELD_COLOURS;
  fsBar.innerHTML = `
    <button type="button" data-fs-act="b" title="Bold" aria-label="Bold" aria-pressed="false"><b>B</b></button>
    <button type="button" data-fs-act="i" title="Italic" aria-label="Italic" aria-pressed="false"><i>I</i></button>
    <span class="fs-sep" aria-hidden="true"></span>
    ${colours.map(([c, name]) => `<button type="button" class="fs-swatch" data-fs-colour="${c}" title="${name}" aria-label="${name} text" aria-pressed="false"><span style="background:${c}"></span></button>`).join('')}
    <span class="fs-sep" aria-hidden="true" data-group="align"></span>
    ${['left', 'center', 'right'].map((a) => `<button type="button" data-fs-align="${a}" data-group="align" title="${ALIGN_NAMES[a]}" aria-label="${ALIGN_NAMES[a]}" aria-pressed="false">${ALIGN_ICONS[a]}</button>`).join('')}
    <span class="fs-sep" aria-hidden="true"></span>
    <button type="button" data-fs-act="clear" title="Clear formatting" aria-label="Clear formatting"><svg viewBox="0 0 24 24"><path d="M6 5h11M11 5l-3 14M4 20l16-16"/></svg></button>`;
}

function styledField() {
  const el = document.activeElement;
  return el && el.matches?.('input[data-fs], textarea[data-fs]') && typeof fieldStyleRef === 'function' && fieldStyleRef(el.dataset.fs) ? el : null;
}

/*
 * Besides a focused sidebar field, the bar can be put over something else: a program cell while its
 * picker is open, or a field in the phone editor. { getEl, ref, avoid } (avoid: an element it mustn't
 * cover, such as the open picker). null takes it away.
 */
let styleTarget = null;
function setStyleTarget(t) { styleTarget = t || null; placeFsBar(); }

// A target marked { outside: true } goes when there's a press anywhere but on it or the bar, or Escape
document.addEventListener('pointerdown', (e) => {
  if (!styleTarget?.outside || fsBar.contains(e.target)) return;
  if (styleTarget.getEl()?.contains(e.target)) return;
  setStyleTarget(null);
}, true);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && styleTarget?.outside) setStyleTarget(null); });

/** What the bar styles now: { el, ref, avoid }, or null. */
function currentStyle() {
  const f = styledField();
  if (f) return { el: f, ref: fieldStyleRef(f.dataset.fs) };
  const el = styleTarget?.getEl();
  if (el && el.isConnected && styleTarget.ref) return { el, ref: styleTarget.ref, avoid: styleTarget.avoid?.() };
  return null;
}

function placeFsBar() {
  const cur = currentStyle();
  if (!cur) { fsBar.hidden = true; return; }
  if (!fsBar.firstChild) drawFsBar();
  fsBar.hidden = false;
  // Above the field (and above what it mustn't cover, such as an open picker), else below them
  const r = cur.el.getBoundingClientRect();
  const a = cur.avoid?.getBoundingClientRect();
  const topEdge = a ? Math.min(r.top, a.top) : r.top, bottomEdge = a ? Math.max(r.bottom, a.bottom) : r.bottom;
  const w = fsBar.offsetWidth, h = fsBar.offsetHeight, gap = 6;
  const vv = window.visualViewport;
  const top0 = vv ? vv.offsetTop : 0, vh = vv ? vv.height : innerHeight;
  let top = topEdge - h - gap;
  if (top < top0 + 4) top = bottomEdge + gap;
  top = Math.min(top, top0 + vh - h - 4);
  fsBar.style.top = `${top}px`;
  fsBar.style.left = `${Math.max(8, Math.min(r.left, innerWidth - w - 8))}px`;
  // On if the field has it, by its own style or by default
  const ref = cur.ref;
  const st = ref.get(), d = ref.defaults || {};
  fsBar.querySelector('[data-fs-act="b"]').setAttribute('aria-pressed', (st.b ?? !!d.b) ? 'true' : 'false');
  fsBar.querySelector('[data-fs-act="i"]').setAttribute('aria-pressed', (st.i ?? !!d.i) ? 'true' : 'false');
  fsBar.querySelectorAll('[data-fs-colour]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.fsColour === st.c ? 'true' : 'false'));
  // Alignment: only for program cells and weeks (their default is the column's)
  fsBar.querySelectorAll('[data-group="align"]').forEach((el) => { el.hidden = !d.a; });
  fsBar.querySelectorAll('[data-fs-align]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.fsAlign === (st.a || d.a) ? 'true' : 'false'));
}

fsBar.addEventListener('pointerdown', (e) => e.preventDefault());
fsBar.addEventListener('mousedown', (e) => e.preventDefault());
fsBar.addEventListener('click', (e) => {
  const cur = currentStyle();
  const b = e.target.closest('[data-fs-act], [data-fs-colour], [data-fs-align]');
  if (!cur || !b) return;
  const ref = cur.ref;
  const d = ref.defaults || {};
  let st = { ...ref.get() };
  if (b.dataset.fsAlign) st.a = b.dataset.fsAlign === d.a ? undefined : b.dataset.fsAlign;     // the column's own: no override
  else if (b.dataset.fsColour) st.c = st.c === b.dataset.fsColour ? undefined : b.dataset.fsColour;  // again: back to the usual colour
  // Clear: plain text, so a field that's bold or italic by default loses that too (B or I puts it back)
  else if (b.dataset.fsAct === 'clear') st = { b: d.b ? false : undefined, i: d.i ? false : undefined, a: st.a };   // alignment stays
  else {
    // Bold or italic flips what the field shows; matching its default is stored as no style at all
    const k = b.dataset.fsAct;
    const next = !(st[k] ?? !!d[k]);
    st[k] = next === !!d[k] ? undefined : next;
  }
  pushHistory();
  ref.set(st);
  save(); renderDoc(); previewFieldStyles();
  placeFsBar();
});

document.addEventListener('focusin', placeFsBar);
document.addEventListener('focusout', () => setTimeout(placeFsBar, 0));
window.addEventListener('resize', placeFsBar);
window.addEventListener('scroll', placeFsBar, true);
window.visualViewport?.addEventListener('resize', placeFsBar);
window.visualViewport?.addEventListener('scroll', placeFsBar);
if (document.body) document.body.appendChild(fsBar);
document.addEventListener('DOMContentLoaded', () => document.body.appendChild(fsBar));
