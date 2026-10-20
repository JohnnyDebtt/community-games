// Saving, in this browser only: small things in localStorage, the Codex (with its
// photographs) in IndexedDB. Everything works, unsaved, where storage is blocked.

const PREFIX = 'lowpass.';

export function load(key, fallback = null) {
  try {
    const v = localStorage.getItem(PREFIX + key);
    return v === null ? fallback : JSON.parse(v);
  } catch { return fallback; }
}
export function save(key, value) {
  try { localStorage.setItem(PREFIX + key, JSON.stringify(value)); } catch { /* private mode, full */ }
}
export function remove(key) {
  try { localStorage.removeItem(PREFIX + key); } catch { /* fine */ }
}

// ------------------------------------------------------------------ the Codex
let dbp = null;
function db() {
  if (!dbp) {
    dbp = new Promise((resolve) => {
      try {
        const req = indexedDB.open('lowpass', 2);
        req.onupgradeneeded = () => {
          const d = req.result;
          if (!d.objectStoreNames.contains('codex')) d.createObjectStore('codex', { keyPath: 'tx' });
          // the board's notes as they came, so it reads at once and outlives a relay's loss
          if (!d.objectStoreNames.contains('board')) d.createObjectStore('board', { keyPath: 'id' });
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
        req.onblocked = () => resolve(null);
      } catch { resolve(null); }
    });
  }
  return dbp;
}

const memory = new Map();

export async function codexAll() {
  const d = await db();
  if (!d) return [...memory.values()];
  return new Promise((resolve) => {
    try {
      const out = [];
      const req = d.transaction('codex', 'readonly').objectStore('codex').openCursor();
      req.onsuccess = () => {
        const c = req.result;
        if (c) { out.push(c.value); c.continue(); } else resolve(out);
      };
      req.onerror = () => resolve([...memory.values()]);
    } catch { resolve([...memory.values()]); }
  });
}

export async function codexPut(entry) {
  memory.set(entry.tx, entry);
  const d = await db();
  if (!d) return;
  await new Promise((resolve) => {
    try {
      const t = d.transaction('codex', 'readwrite');
      t.objectStore('codex').put(entry);
      t.oncomplete = resolve;
      t.onerror = resolve;
    } catch { resolve(); }
  });
}

// ------------------------------------------------------------------ the board's cache
export async function boardAll() {
  const d = await db();
  if (!d) return [];
  return new Promise((resolve) => {
    try {
      const out = [];
      const req = d.transaction('board', 'readonly').objectStore('board').openCursor();
      req.onsuccess = () => {
        const c = req.result;
        if (c) { out.push(c.value); c.continue(); } else resolve(out);
      };
      req.onerror = () => resolve([]);
    } catch { resolve([]); }
  });
}

// keep: the events to keep (raw, signed); everything else in the cache goes
export async function boardKeep(events) {
  const d = await db();
  if (!d) return;
  await new Promise((resolve) => {
    try {
      const t = d.transaction('board', 'readwrite');
      const st = t.objectStore('board');
      st.clear();
      for (const ev of events) st.put(ev);
      t.oncomplete = resolve;
      t.onerror = resolve;
    } catch { resolve(); }
  });
}
