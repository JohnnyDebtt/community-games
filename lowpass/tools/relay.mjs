// A tiny Nostr relay for testing the Codex board locally, without writing to public
// relays: node tools/relay.mjs [port=7777], then open the game with ?dev&relay=ws://localhost:7777
// Keeps events in memory; answers REQ (kinds, authors, ids, #t, since, until, limit),
// EVENT (with OK) and CLOSE. Checks nothing: the game's readers do the checking.
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';

const port = Number(process.argv[2] || 7777);
const events = [];
const subs = new Set();   // { sock, id, filters }

function match(ev, f) {
  if (f.ids && !f.ids.includes(ev.id)) return false;
  if (f.kinds && !f.kinds.includes(ev.kind)) return false;
  if (f.authors && !f.authors.includes(ev.pubkey)) return false;
  if (f.since && ev.created_at < f.since) return false;
  if (f.until && ev.created_at > f.until) return false;
  for (const k of Object.keys(f)) {
    if (k[0] !== '#') continue;
    const want = f[k];
    if (!ev.tags.some((t) => t[0] === k.slice(1) && want.includes(t[1]))) return false;
  }
  return true;
}

function frame(text) {
  const p = Buffer.from(text);
  const n = p.length;
  const head = n < 126 ? Buffer.from([0x81, n]) : n < 65536 ? Buffer.from([0x81, 126, n >> 8, n & 255]) : Buffer.concat([Buffer.from([0x81, 127]), (() => { const b = Buffer.alloc(8); b.writeBigUInt64BE(BigInt(n)); return b; })()]);
  return Buffer.concat([head, p]);
}
const send = (sock, msg) => { try { sock.write(frame(JSON.stringify(msg))); } catch { /* gone */ } };

const server = createServer((req, res) => res.writeHead(200, { 'content-type': 'text/plain' }).end('low pass test relay'));
server.on('upgrade', (req, sock) => {
  const key = req.headers['sec-websocket-key'];
  const accept = createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  sock.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
  let buf = Buffer.alloc(0);
  let frag = [];
  sock.on('data', (d) => {
    buf = Buffer.concat([buf, d]);
    for (;;) {
      if (buf.length < 2) return;
      const fin = buf[0] & 0x80, op = buf[0] & 0x0f, masked = buf[1] & 0x80;
      let len = buf[1] & 0x7f, off = 2;
      if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4; }
      else if (len === 127) { if (buf.length < 10) return; len = Number(buf.readBigUInt64BE(2)); off = 10; }
      const mask = masked ? buf.subarray(off, off + 4) : null;
      if (masked) off += 4;
      if (buf.length < off + len) return;
      const payload = Buffer.from(buf.subarray(off, off + len));
      if (mask) for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i & 3];
      buf = buf.subarray(off + len);
      if (op === 8) { sock.end(); return; }
      if (op === 9) { sock.write(Buffer.concat([Buffer.from([0x8a, payload.length]), payload])); continue; }
      if (op === 1 || op === 0) {
        frag.push(payload);
        if (!fin) continue;
        const text = Buffer.concat(frag).toString();
        frag = [];
        let msg;
        try { msg = JSON.parse(text); } catch { continue; }
        if (msg[0] === 'EVENT') {
          const ev = msg[1];
          if (!events.some((e) => e.id === ev.id)) {
            events.push(ev);
            for (const s of subs) if (s.filters.some((f) => match(ev, f))) send(s.sock, ['EVENT', s.id, ev]);
          }
          send(sock, ['OK', ev.id, true, '']);
          console.log('event', ev.id.slice(0, 12), ev.kind, JSON.stringify(ev.content).slice(0, 60));
        } else if (msg[0] === 'REQ') {
          const [, id, ...filters] = msg;
          for (const s of subs) if (s.sock === sock && s.id === id) subs.delete(s);
          subs.add({ sock, id, filters });
          const out = events.filter((e) => filters.some((f) => match(e, f))).sort((a, b) => b.created_at - a.created_at);
          const lim = Math.min(...filters.map((f) => f.limit || 500));
          for (const e of out.slice(0, lim)) send(sock, ['EVENT', id, e]);
          send(sock, ['EOSE', id]);
        } else if (msg[0] === 'CLOSE') {
          for (const s of subs) if (s.sock === sock && s.id === msg[1]) subs.delete(s);
        }
      }
    }
  });
  sock.on('close', () => { for (const s of subs) if (s.sock === sock) subs.delete(s); });
  sock.on('error', () => {});
});
server.listen(port, () => console.log(`test relay at ws://localhost:${port}`));
