// A tiny static file server for local play and development:
//   node tools/serve.mjs [port]
// Serves the folder above this script. Any static host (GitHub Pages, itch.io,
// Netlify, a plain web server) works the same way; nothing here is needed in production.
import http from 'node:http';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const port = Number(process.env.PORT || process.argv[2] || 8123);
const types = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.md': 'text/markdown; charset=utf-8', '.txt': 'text/plain; charset=utf-8',
};

// Development only: tools/snapshot.html posts a fresh SEEKER NET snapshot here.
async function saveSnapshot(req, res) {
  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 2e6) throw new Error('too large');
  }
  const s = JSON.parse(body);
  if (!Array.isArray(s.charges) || s.charges.length !== 2222 || !Array.isArray(s.status) || s.status.length !== 2222) throw new Error('not a snapshot');
  if (!s.charges.every((v) => typeof v === 'number' && v >= 0 && v < 1e7) || !s.status.every((v) => [0, 1, 2, 3].includes(v))) throw new Error('bad values');
  const out = { at: Number(s.at) || Date.now(), activated: Number(s.activated) || 0, accD: String(s.accD || ''), accA: String(s.accA || ''), charges: s.charges, status: s.status };
  await writeFile(join(root, 'assets', 'seekernet', 'snapshot.json'), JSON.stringify(out));
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ ok: true, bytes: JSON.stringify(out).length }));
}

// Development only: save a captured frame (a PNG data URL) to .shots/ for inspection.
async function saveShot(req, res) {
  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 3e7) throw new Error('too large');
  }
  const m = /^data:image\/png;base64,(.+)$/.exec(body);
  if (!m) throw new Error('not a png');
  const { mkdir } = await import('node:fs/promises');
  await mkdir(join(root, '.shots'), { recursive: true });
  const name = (new URL(req.url, 'http://x').searchParams.get('name') || 'shot').replace(/[^a-z0-9_-]/gi, '');
  await writeFile(join(root, '.shots', name + '.png'), Buffer.from(m[1], 'base64'));
  res.writeHead(200);
  res.end('ok');
}

http.createServer(async (req, res) => {
  if (req.method === 'POST' && req.url.startsWith('/__shot')) {
    try { await saveShot(req, res); } catch (e) { res.writeHead(400); res.end(String(e.message || e)); }
    return;
  }
  if (req.method === 'POST' && req.url === '/__snapshot') {
    try { await saveSnapshot(req, res); } catch (e) { res.writeHead(400); res.end(String(e.message || e)); }
    return;
  }
  try {
    let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (path.endsWith('/')) path += 'index.html';
    const file = normalize(join(root, path));
    if (!file.startsWith(root)) throw new Error('outside');
    const s = await stat(file);
    if (!s.isFile()) throw new Error('not a file');
    res.writeHead(200, { 'content-type': types[extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache' });
    res.end(await readFile(file));
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('not found');
  }
}).on('error', (e) => {
  if (e.code !== 'EADDRINUSE') throw e;
  // most likely this server, started before: say where, rather than a stack trace
  console.log(`Port ${port} is taken: Soundings may already be running at http://localhost:${port}/`);
  console.log(`(another port: node tools/serve.mjs ${port + 1})`);
  process.exit(1);
}).listen(port, '127.0.0.1', () => console.log(`Soundings at http://localhost:${port}/`));
