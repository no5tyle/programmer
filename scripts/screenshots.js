// Makes the README's screenshot of the app (docs/app-desktop.png): `node scripts/screenshots.js`.
// It opens the example program beside a few others, with Settings open and a description being edited.
const { spawn } = require('child_process');
const path = require('path');
const { chromium } = require('@playwright/test');

const root = path.join(__dirname, '..');
const port = 8799;

(async () => {
  const server = spawn(process.execPath, [path.join(root, 'tests', 'serve.js')], { env: { ...process.env, PORT: String(port) }, stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 800));
  const browser = await chromium.launch({ args: ['--lang=en-AU'], env: { ...process.env, LANG: 'en_AU.UTF-8', LANGUAGE: 'en_AU' } });   // date fields follow the browser's own language
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, locale: 'en-AU', timezoneId: 'Australia/Adelaide' });
    await page.addInitScript(() => localStorage.setItem('scoutProgramBuilder.welcome', 'done'));
    await page.goto(`http://localhost:${port}/`);
    await page.waitForFunction(() => typeof state === 'object' && document.querySelector('#fitStatus')?.textContent !== '—');
    await page.evaluate(async () => {
      const example = await (await fetch('examples/example-program.json')).json();
      // A few programs in other sections and terms, for the list on the left
      for (const [section, year, term] of [['joeys', 2027, 1], ['cubs', 2026, 4], ['cubs', 2026, 3], ['scouts', 2027, 1], ['scouts', 2026, 4]]) {
        const c = copyOf(normalise(example));
        Object.assign(c.branding, { section, sectionName: SECTIONS[section].name, color: SECTIONS[section].color });
        Object.assign(c.term, { year, term });
        addProgram(c);
      }
      addProgram(copyOf(normalise(example)));
      // The starting blank program isn't wanted in the picture
      library.items = library.items.filter((x) => x.id === library.current || x.section !== 'cubs' || x.year !== 2026 || x.term !== 4 || x.group);
      save(); renderAll();
      const faces = ['400', '600', '700', '800'].flatMap((w) => [`${w} 12px Nunito`, `italic ${w} 12px Nunito`, `${w} 12px Inter`]);
      await Promise.all(faces.map((f) => document.fonts.load(f).catch(() => null)));
      await document.fonts.ready;
      fit();
    });
    await page.click('#sheet tbody tr:nth-child(4) td.c-description .ed');
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(root, 'docs', 'app-desktop.png') });
    console.log('docs/app-desktop.png');
  } finally {
    await browser.close();
    server.kill();
  }
})();
