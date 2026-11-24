/*
  The qStored app switcher, at the top left of every qStored site, in place of its own icon:

    <link rel="stylesheet" href="css/qstored-switcher.css">
    <script src="js/qstored-switcher.js" defer></script>
    <qs-app-switcher current="programmer">
      …the site's own icon, shown until this script runs…
    </qs-app-switcher>

  The button shows the current site's icon; it opens a menu of qStored's apps, with the current one
  marked. On a site that isn't one of them (the qStored account, current="account", or the group site,
  current="group") none is marked. The
  account itself is linked from each site's own account menu, not from here. Sysadmin-only pages (the internal dashboard)
  are listed only while the element has the `sysadmin` attribute, which the site sets once it knows
  the signed-in account has that role: el.toggleAttribute('sysadmin', true). Listing it hides nothing:
  the API is what refuses non-sysadmins.

  It draws into the page itself (no shadow DOM, no images from elsewhere, no inline styles), so it
  works under each site's strict Content-Security-Policy. Size it with --qs-switch-size (36px).

  The same file is in programmer, qstored-internal, qstored-account, qstored-group, pinewood-control
  (frontend/public) and qstored-gear (static). Change them all together.
  To add an app, add it to APPS below.

  The group switcher, beside it in the bar of each app that works on a group (Quarters Master, the group site
  and the Program Builder):

    <qs-group-switcher></qs-group-switcher>
    el.groups = [{ id, name }];  el.current = gid;   // drawn when set; with no groups, it offers to start one
    el.addEventListener('qs-group-change', (e) => …e.detail.id…);   // the site goes to that group's address

  It shows the current group's name, and opens a menu of the person's groups and a way to start or join another.
  Where the bar is narrow, a site can show the group's letter instead of its name: `qs-group-switcher[compact]`
  (or the same rules as that, in its own media query).
  `none-label` (the Program Builder's "My programs") adds an item for no group, whose id is ''.

  The current group is shared across qStored's apps: window.qsGroup.get(uid) and .set(uid, gid), kept in a
  cookie on qstored.org (this host's only, locally) with whose it is, so someone else signing in doesn't take it
  up. Picking a group sets it; each site also sets it from its address, which always wins.
*/
(() => {
  if (customElements.get('qs-app-switcher')) return;

  // Icons drawn inline (36 × 36), so no site has to allow images from elsewhere. Each product has its own colour:
  // the Program Builder teal-blue, Pinewood British racing green, Quarters Master amber; qStored's own navy is for qstored.org.
  const ICONS = {
    pinewood: '<svg viewBox="0 0 512 512" aria-hidden="true"><rect width="512" height="512" rx="120" fill="#004225"/><g transform="translate(51 51) scale(.8)"><path fill="#fff" d="M408.29 262.879a35.125 35.125 0 1 0 35.125 35.125 35.17 35.17 0 0 0-35.125-35.125zm0 62.873a27.736 27.736 0 1 1 27.736-27.737 27.736 27.736 0 0 1-27.736 27.748zm8.876-27.737a8.876 8.876 0 1 1-8.876-8.875 8.876 8.876 0 0 1 8.876 8.875zm-265.538 0a35.125 35.125 0 1 0-35.126 35.126 35.17 35.17 0 0 0 35.126-35.126zm-35.126 27.737a27.736 27.736 0 1 1 27.737-27.737 27.736 27.736 0 0 1-27.737 27.748zm345.452-21.823a53.997 53.997 0 1 0-107.617-5.925 53.665 53.665 0 0 0 5.447 23.61H165.008a53.986 53.986 0 1 0-101.849-15.211C37.542 295.64 21 278.033 21 250.186c0-28.846 86.87-69.418 142.122-71.327v34.094a24.83 24.83 0 0 0 24.83 24.83h47.517a24.774 24.774 0 0 0 24.409-20.758s-1.62-21.668-6.813-25.518l3.407-2.54 24.474 28.08h94.104c63.994-.022 115.95 23.42 115.95 52.266 0 13.314-10.973 25.396-29.046 34.616zm-336.576-5.925a8.876 8.876 0 1 1-8.876-8.876 8.876 8.876 0 0 1 8.876 8.887z"/></g></svg>',
    gear: '<svg viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="8" fill="#B45309"/><path d="M8 13 16 8l8 5v10H8zM12 23v-5h8v5" fill="none" stroke="#fff" stroke-width="2.2" stroke-linejoin="round"/></svg>',
    programmer: '<svg viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="8" fill="#0E7490"/><path d="M8 10h16M8 16h16M8 22h10" stroke="#fff" stroke-width="2.5" stroke-linecap="round"/></svg>',
    internal: '<svg viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="8" fill="#6D28D9"/><path d="M16 7.5 9 10.5v5c0 4.4 3 7.9 7 9 4-1.1 7-4.6 7-9v-5z" fill="none" stroke="#fff" stroke-width="2.2" stroke-linejoin="round"/></svg>',
    group: '<svg viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="8" fill="#2c6e49"/><circle cx="12" cy="12" r="3.5" fill="none" stroke="#fff" stroke-width="2"/><circle cx="21" cy="13" r="3" fill="none" stroke="#fff" stroke-width="2"/><path d="M5.5 24a6.5 6.5 0 0 1 13 0M17 24a5 5 0 0 1 9.5-2" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round"/></svg>',
    account: '<svg viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="8" fill="#3a3a3c"/><circle cx="16" cy="12.5" r="4.5" fill="none" stroke="#fff" stroke-width="2.2"/><path d="M8.5 24.5a7.5 7.5 0 0 1 15 0" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/></svg>',
  };

  const APPS = [
    { id: 'programmer', name: 'Program Builder', tagline: 'Term programs for Scout families', url: 'https://program.qstored.org/' },
    { id: 'pinewood', name: 'Pinewood Control', tagline: 'Race night for pinewood derbies', url: 'https://pinewood.qstored.org/' },
    { id: 'gear', name: 'Quarters Master', tagline: "Your group's Q-Store, supplies and halls", url: 'https://gear.qstored.org/' },
    { id: 'internal', name: 'Internal', tagline: 'Accounts and admin', url: 'https://internal.qstored.org/', sysadmin: true },
  ];

  const CHEVRON =
    '<svg class="qs-switch-chevron" viewBox="0 0 12 12" aria-hidden="true"><path d="M3 4.5 6 7.5 9 4.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const CHECK =
    '<svg class="qs-switch-check" viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8.5 6.5 11.5 12.5 4.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  const escape = (text) => String(text).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  let count = 0;

  class AppSwitcher extends HTMLElement {
    static get observedAttributes() { return ['sysadmin']; }

    connectedCallback() {
      if (this.button) return;
      const current = this.getAttribute('current');
      const id = `qs-switch-${++count}`;
      this.classList.add('qs-switch');
      const name = APPS.find((app) => app.id === current)?.name;
      const parts = document.createElement('template');
      parts.innerHTML = `
        <button type="button" class="qs-switch-btn" aria-haspopup="menu" aria-expanded="false" aria-controls="${id}"
          aria-label="${escape(name ? `${name}: switch app` : 'Switch app')}" title="Switch app">
          <span class="qs-switch-icon">${ICONS[current] ?? ICONS.account}</span>
          ${CHEVRON}
        </button>
        <div class="qs-switch-backdrop" hidden></div>
        <div class="qs-switch-menu" id="${id}" role="menu" aria-label="qStored apps" hidden></div>`;
      this.append(parts.content);
      this.button = this.querySelector('.qs-switch-btn');
      this.menu = this.querySelector('.qs-switch-menu');
      this.backdrop = this.querySelector('.qs-switch-backdrop');
      this.drawMenu();
      this.button.addEventListener('click', () => (this.isOpen ? this.close() : this.open()));
      this.backdrop.addEventListener('click', () => this.close());
      this.addEventListener('keydown', (e) => this.onKey(e));
      // Moving to another app (or within this one) closes the menu
      this.menu.addEventListener('click', (e) => { if (e.target.closest('.qs-switch-item')) this.close(false); });
    }

    attributeChangedCallback() {
      if (this.menu) this.drawMenu();
    }

    drawMenu() {
      const current = this.getAttribute('current');
      const item = (app) => `
        <a class="qs-switch-item" role="menuitem" href="${escape(app.url)}" ${app.id === current ? 'aria-current="page"' : ''}>
          <span class="qs-switch-item-icon">${ICONS[app.id]}</span>
          <span class="qs-switch-text"><span class="qs-switch-name">${escape(app.name)}</span><span class="qs-switch-tagline">${escape(app.tagline)}</span></span>
          ${app.id === current ? CHECK : ''}
        </a>`;
      const sysadmin = this.hasAttribute('sysadmin');
      this.menu.innerHTML = `
        <div class="qs-switch-head" aria-hidden="true">qStored apps</div>
        ${APPS.filter((app) => !app.sysadmin || sysadmin || app.id === current).map((app) => item(app)).join('')}`;
      this.items = [...this.menu.querySelectorAll('.qs-switch-item')];
    }

    get isOpen() {
      return !this.menu.hidden;
    }

    open() {
      this.menu.hidden = this.backdrop.hidden = false;
      this.button.setAttribute('aria-expanded', 'true');
      (this.items.find((item) => item.hasAttribute('aria-current')) ?? this.items[0]).focus();
    }

    close(refocus = true) {
      if (!this.isOpen) return;
      this.menu.hidden = this.backdrop.hidden = true;
      this.button.setAttribute('aria-expanded', 'false');
      if (refocus) this.button.focus();
    }

    onKey(e) {
      if (!this.isOpen) {
        if (e.target === this.button && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
          e.preventDefault();
          this.open();
        }
        return;
      }
      const at = this.items.indexOf(document.activeElement);
      const move = (to) => {
        e.preventDefault();
        this.items[(to + this.items.length) % this.items.length].focus();
      };
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        this.close();
      } else if (e.key === 'ArrowDown') move(at + 1);
      else if (e.key === 'ArrowUp') move(at < 0 ? -1 : at - 1);
      else if (e.key === 'Home') move(0);
      else if (e.key === 'End') move(-1);
      else if (e.key === 'Tab') this.close(false);
    }
  }

  customElements.define('qs-app-switcher', AppSwitcher);

  /* -------------------------------------------------------------- the current group, shared across the apps */

  const GROUP_COOKIE = 'qstored_group';
  const cookieAttrs = () => `; Path=/; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}${/(^|\.)qstored\.org$/.test(location.hostname) ? '; Domain=qstored.org' : ''}`;
  window.qsGroup = {
    /** The group this person was last working in, in any qStored app, or null. */
    get(uid) {
      const m = document.cookie.match(/(?:^|;\s*)qstored_group=([^;]*)/);
      if (!m) return null;
      try {
        const v = JSON.parse(decodeURIComponent(m[1]));
        return v && v.uid === uid && typeof v.gid === 'string' ? v.gid : null;
      } catch { return null; }
    },
    /** Remembers the group they're working in, for every qStored app; null forgets it. */
    set(uid, gid) {
      document.cookie = gid
        ? `${GROUP_COOKIE}=${encodeURIComponent(JSON.stringify({ uid, gid }))}; Max-Age=${365 * 86400}${cookieAttrs()}`
        : `${GROUP_COOKIE}=; Max-Age=0${cookieAttrs()}`;
    },
  };

  /* -------------------------------------------------------------- the group switcher */

  const GROUP_SITE = 'https://group.qstored.org/';
  /** A group's letter: its name's first word that isn't a number ("1st Wattle Creek Scouts" is W). */
  const initial = (name) => ((name.split(/\s+/).find((w) => /^[^\d]/.test(w)) || name.trim() || '?')[0]).toUpperCase();

  class GroupSwitcher extends HTMLElement {
    connectedCallback() {
      if (this.button) return;
      const id = `qs-group-${++count}`;
      this.classList.add('qs-switch', 'qs-group');
      this.innerHTML = `
        <button type="button" class="qs-group-btn" aria-haspopup="menu" aria-expanded="false" aria-controls="${id}">
          <span class="qs-group-badge" aria-hidden="true"></span><span class="qs-group-name"></span>${CHEVRON}
        </button>
        <div class="qs-switch-backdrop" hidden></div>
        <div class="qs-switch-menu qs-group-menu" id="${id}" role="menu" aria-label="Your groups" hidden></div>`;
      this.button = this.querySelector('.qs-group-btn');
      this.menu = this.querySelector('.qs-switch-menu');
      this.backdrop = this.querySelector('.qs-switch-backdrop');
      this.button.addEventListener('click', () => (this.isOpen ? this.close() : this.open()));
      this.backdrop.addEventListener('click', () => this.close());
      this.addEventListener('keydown', (e) => AppSwitcher.prototype.onKey.call(this, e));
      this.menu.addEventListener('click', (e) => {
        const item = e.target.closest('[data-group]');
        if (!item) { if (e.target.closest('.qs-switch-item')) this.close(false); return; }
        e.preventDefault();
        this.close();
        const gid = item.dataset.group;
        if (gid === (this._current ?? '')) return;
        this._current = gid;
        this.draw();
        this.dispatchEvent(new CustomEvent('qs-group-change', { detail: { id: gid }, bubbles: true }));
      });
      this.draw();
    }

    set groups(list) { this._groups = Array.isArray(list) ? list : []; this.draw(); }
    get groups() { return this._groups ?? []; }
    set current(gid) { this._current = gid || ''; this.draw(); }
    get current() { return this._current ?? ''; }

    draw() {
      if (!this.button) return;
      const noneLabel = this.getAttribute('none-label');
      const groups = this.groups;
      const here = groups.find((g) => g.id === this.current);
      const label = here?.name ?? (noneLabel || (groups.length ? 'Choose a group' : 'No group yet'));
      this.querySelector('.qs-group-name').textContent = label;
      this.querySelector('.qs-group-badge').textContent = here ? initial(here.name) : '+';
      this.button.setAttribute('aria-label', `${label}: switch group`);
      this.button.title = 'Switch group';
      const item = (gid, name, hint) => `
        <a class="qs-switch-item qs-group-item" role="menuitem" href="#" data-group="${escape(gid)}" ${gid === this.current ? 'aria-current="page"' : ''}>
          <span class="qs-group-initial" aria-hidden="true">${escape(initial(name))}</span>
          <span class="qs-switch-text"><span class="qs-switch-name">${escape(name)}</span>${hint ? `<span class="qs-switch-tagline">${escape(hint)}</span>` : ''}</span>
          ${gid === this.current ? CHECK : ''}
        </a>`;
      const ROLE = { owner: 'Owner', admin: 'Admin', leader: 'Leader' };
      this.menu.innerHTML = `
        <div class="qs-switch-head" aria-hidden="true">Your groups</div>
        ${noneLabel ? item('', noneLabel, 'Not in a group') : ''}
        ${groups.map((g) => item(g.id, g.name, ROLE[g.role] ?? '')).join('')}
        <a class="qs-switch-item qs-group-more" role="menuitem" href="${GROUP_SITE}#/new">
          <span class="qs-group-initial qs-group-plus" aria-hidden="true">+</span>
          <span class="qs-switch-text"><span class="qs-switch-name">Start or join a group</span></span>
        </a>`;
      this.items = [...this.menu.querySelectorAll('.qs-switch-item')];
    }

    get isOpen() { return !this.menu.hidden; }
    open() { AppSwitcher.prototype.open.call(this); }
    close(refocus = true) { AppSwitcher.prototype.close.call(this, refocus); }
  }

  customElements.define('qs-group-switcher', GroupSwitcher);
})();
