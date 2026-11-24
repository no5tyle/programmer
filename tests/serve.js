// Tiny static file server for the tests (and `npm run serve`): serves the repository root.
const http = require('http');
const fs = require('fs');
const path = require('path');

// SITE_ROOT=_site serves the folder that gets published (see .github/workflows/pages.yml).
const root = path.resolve(process.env.SITE_ROOT || path.join(__dirname, '..'));
const port = +process.env.PORT || 8765;
const types = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.ico': 'image/x-icon',
};

http.createServer((req, res) => {
  const url = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  let file = path.join(root, url);
  if (!file.startsWith(root)) { res.writeHead(403); res.end(); return; }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  fs.readFile(file, (err, data) => {
    // As GitHub Pages does: anything that isn't a file is the site's 404.html, with a 404
    if (err) {
      fs.readFile(path.join(root, '404.html'), (e2, page) => {
        res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end(e2 ? 'Not found' : page);
      });
      return;
    }
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(data);
  });
}).listen(port, () => console.log(`Serving ${root} on http://localhost:${port}/`));
