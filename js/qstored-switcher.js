/*
  The qstored app switcher, at the top left of every qstored site, in place of its own icon:

    <link rel="stylesheet" href="css/qstored-switcher.css">
    <script src="js/qstored-switcher.js" defer></script>
    <qs-app-switcher current="programmer">
      …the site's own icon, shown until this script runs…
    </qs-app-switcher>

  The button shows the current site's icon; it opens a menu of qstored's apps, with the current one
  marked, and a link to the qstored account at the bottom. Sysadmin-only pages (the internal dashboard)
  are listed only while the element has the `sysadmin` attribute, which the site sets once it knows
  the signed-in account has that role: el.toggleAttribute('sysadmin', true). Listing it hides nothing:
  the API is what refuses non-sysadmins.

  It draws into the page itself (no shadow DOM, no images from elsewhere, no inline styles), so it
  works under each site's strict Content-Security-Policy. Size it with --qs-switch-size (36px).

  The same file is in programmer, qstored-internal and qstored-account. Change all three together.
  To add an app, add it to APPS below.
*/
(() => {
  if (customElements.get('qs-app-switcher')) return;

  // Icons drawn inline (36 × 36), so no site has to allow images from elsewhere
  const ICONS = {
    programmer: '<svg viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="8" fill="#052767"/><path d="M8 10h16M8 16h16M8 22h10" stroke="#fff" stroke-width="2.5" stroke-linecap="round"/></svg>',
    internal: '<svg viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="8" fill="#b42318"/><path d="M16 7.5 9 10.5v5c0 4.4 3 7.9 7 9 4-1.1 7-4.6 7-9v-5z" fill="none" stroke="#fff" stroke-width="2.2" stroke-linejoin="round"/></svg>',
    account: '<svg viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="8" fill="#3a3a3c"/><circle cx="16" cy="12.5" r="4.5" fill="none" stroke="#fff" stroke-width="2.2"/><path d="M8.5 24.5a7.5 7.5 0 0 1 15 0" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/></svg>',
  };

  const APPS = [
    { id: 'programmer', name: 'Program Builder', tagline: 'Term programs for Scout families', url: 'https://program.qstored.org/' },
    { id: 'internal', name: 'Internal', tagline: 'Accounts and admin', url: 'https://internal.qstored.org/', sysadmin: true },
  ];
  const ACCOUNT = { id: 'account', name: 'Your qstored account', tagline: 'account.qstored.org', url: 'https://account.qstored.org/' };

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
      const name = [...APPS, ACCOUNT].find((app) => app.id === current)?.name;
      const parts = document.createElement('template');
      parts.innerHTML = `
        <button type="button" class="qs-switch-btn" aria-haspopup="menu" aria-expanded="false" aria-controls="${id}"
          aria-label="${escape(name ? `${name}: switch app` : 'Switch app')}" title="Switch app">
          <span class="qs-switch-icon">${ICONS[current] ?? ICONS.account}</span>
          ${CHEVRON}
        </button>
        <div class="qs-switch-backdrop" hidden></div>
        <div class="qs-switch-menu" id="${id}" role="menu" aria-label="qstored apps" hidden></div>`;
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
      const item = (app, extra = '') => `
        <a class="qs-switch-item ${extra}" role="menuitem" href="${escape(app.url)}" ${app.id === current ? 'aria-current="page"' : ''}>
          <span class="qs-switch-item-icon">${ICONS[app.id]}</span>
          <span class="qs-switch-text"><span class="qs-switch-name">${escape(app.name)}</span><span class="qs-switch-tagline">${escape(app.tagline)}</span></span>
          ${app.id === current ? CHECK : ''}
        </a>`;
      const sysadmin = this.hasAttribute('sysadmin');
      this.menu.innerHTML = `
        <div class="qs-switch-head" aria-hidden="true">qstored apps</div>
        ${APPS.filter((app) => !app.sysadmin || sysadmin || app.id === current).map((app) => item(app)).join('')}
        ${item(ACCOUNT, 'qs-switch-account')}`;
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
})();
