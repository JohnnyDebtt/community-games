// Tiny DOM helpers. Text always goes in as text, never as markup.

export function el(tag, cls, parent, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined && text !== null) e.textContent = text;
  if (parent) parent.append(e);
  return e;
}

export function clear(e) {
  while (e.firstChild) e.removeChild(e.firstChild);
  return e;
}

export function ago(ms) {
  if (!ms) return '';
  const s = Math.max(0, (Date.now() - ms) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
}

export function dateStr(ms) {
  if (!ms) return '—';
  const d = new Date(ms);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) + ' ' + d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
}

export const short = (a) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : '');

// a key cap
export function key(parent, label) {
  return el('span', 'kc', parent, label);
}
