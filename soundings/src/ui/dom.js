// Tiny DOM helpers for the interface.

export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'html') el.innerHTML = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export function clear(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
  return el;
}

export function keyName(action, device) {
  const touch = device === 'touch', pad = device === 'gamepad';
  const map = {
    action: touch ? 'tap' : pad ? 'A' : 'Space',
    interact: touch ? 'tap ◇' : pad ? 'X' : 'E',
    back: touch ? '✕' : pad ? 'B' : 'Esc',
    up: pad ? 'RT' : 'W',
    down: pad ? 'LT' : 'S',
    codex: pad ? 'Y' : 'Tab',
    net: pad ? 'Select' : 'N',
    sense: pad ? 'R3' : 'V',
    lantern: 'L',
    bait: 'B',
    walk: pad ? 'L3' : 'Shift',
  };
  return map[action] || action;
}

export function kbd(text) {
  return h('span', { class: 'kbd' }, text);
}
