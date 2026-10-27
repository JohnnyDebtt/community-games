// SPDX-License-Identifier: MIT OR Apache-2.0
// Local preview serves only this game's folder, bound to loopback.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const prefix = '/community-games/seeker-resonance-vault/';
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.md': 'text/plain' };
http.createServer((request, response) => {
  try {
    let name = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    if (name.startsWith(prefix)) name = name.slice(prefix.length);
    else if (name === '/') name = '';
    else { response.writeHead(404).end(); return; }
    const file = path.resolve(root, name || 'index.html');
    if (!file.startsWith(root + path.sep) || !fs.statSync(file).isFile()) {
      response.writeHead(404).end(); return;
    }
    response.writeHead(200, { 'Content-Type': (mime[path.extname(file)] || 'text/plain') + '; charset=utf-8', 'Cache-Control': 'no-store' });
    fs.createReadStream(file).pipe(response);
  } catch { response.writeHead(404).end(); }
}).listen(4173, '127.0.0.1', () => console.log('Review: http://127.0.0.1:4173' + prefix));
