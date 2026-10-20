// Proving you hold SEEKER NET seekers, safely, to post on the Codex board.
//
// The game asks your wallet for one thing: a signature on a short plain-language message
// that links this browser's board key to your address. Signing is free and is not a
// transaction: it sends nothing, approves nothing and cannot move anything you own. The
// signature travels with every post, and every reader checks it in the page (keccak-256
// and secp256k1 public-key recovery), then checks on Robinhood Chain, read only, that the
// address holds at least one seeker.
//
// The game never calls eth_sendTransaction, eth_signTransaction, any approve, or any
// typed-data permit, and never asks for a seed phrase or a private key.
//
// Wallets are found through EIP-6963 (MetaMask, Rabby, Phantom's EVM wallet, Coinbase
// Wallet and others), with window.ethereum as a fallback.
// Adapted from SeekerCraft (MIT OR Apache-2.0).

import { Signature } from '../../vendor/noble-secp256k1.js';
import { keccak256, toHex, fromHex } from '../core/keccak.js';
import { load, save, remove } from '../core/store.js';

const enc = (s) => new TextEncoder().encode(s);

export function discover(wait = 400) {
  return new Promise((resolve) => {
    const found = new Map();
    const onAnnounce = (e) => {
      const d = e.detail;
      if (d && d.info && d.provider && !found.has(d.info.uuid)) found.set(d.info.uuid, { name: d.info.name, icon: d.info.icon, rdns: d.info.rdns, provider: d.provider });
    };
    window.addEventListener('eip6963:announceProvider', onAnnounce);
    window.dispatchEvent(new Event('eip6963:requestProvider'));
    setTimeout(() => {
      window.removeEventListener('eip6963:announceProvider', onAnnounce);
      const list = [...found.values()];
      const legacy = window.phantom && window.phantom.ethereum ? [{ name: 'Phantom', provider: window.phantom.ethereum }] : [];
      if (window.ethereum && !list.some((w) => w.provider === window.ethereum)) legacy.push({ name: window.ethereum.isMetaMask ? 'MetaMask' : 'Browser wallet', provider: window.ethereum });
      for (const l of legacy) if (!list.some((w) => w.provider === l.provider || w.name === l.name)) list.push(l);
      resolve(list);
    }, wait);
  });
}

// The words that are signed: the same for every reader to rebuild from a post.
export function linkMessage(address, boardKey) {
  return [
    'Low Pass: link a posting key to this address.',
    '',
    'This lets the key below post on the Low Pass Codex board for this address while it holds a SEEKER NET seeker.',
    'Signing is free. It is not a transaction: it sends nothing, approves nothing and cannot move anything you own.',
    '',
    `Address: ${address.toLowerCase()}`,
    `Board key: ${boardKey}`,
  ].join('\n');
}

// Who signed a personal message (EIP-191), as a lowercase address.
export function signer(message, signature) {
  const body = enc(message);
  const hash = keccak256(new Uint8Array([...enc(`\x19Ethereum Signed Message:\n${body.length}`), ...body]));
  const sig = fromHex(signature);
  if (sig.length !== 65) throw new Error('unexpected signature length');
  let v = sig[64];
  if (v >= 27) v -= 27;
  const pub = Signature.fromCompact(sig.slice(0, 64)).addRecoveryBit(v).recoverPublicKey(hash).toRawBytes(false);
  return '0x' + toHex(keccak256(pub.slice(1))).slice(24);
}

const verified = new Map();
export function checkLink(address, boardKey, signature) {
  const k = `${address}:${boardKey}:${signature}`;
  if (verified.has(k)) return verified.get(k);
  let ok = false;
  try {
    ok = /^0x[0-9a-f]{40}$/.test(address) && /^0x[0-9a-f]{130}$/i.test(signature) && signer(linkMessage(address, boardKey), signature) === address;
  } catch { ok = false; }
  verified.set(k, ok);
  return ok;
}

// Connect, ask for the one signature, check it. Resolves with the link, or throws.
export async function link(provider, boardKey) {
  const accounts = await provider.request({ method: 'eth_requestAccounts' });
  const address = accounts && accounts[0] && accounts[0].toLowerCase();
  if (!address) throw new Error('The wallet shared no address');
  const message = linkMessage(address, boardKey);
  const hexMsg = '0x' + toHex(enc(message));
  const signature = await provider.request({ method: 'personal_sign', params: [hexMsg, address] });
  if (!checkLink(address, boardKey, signature)) throw new Error('The signature did not match the address');
  const l = { address, boardKey, signature, at: Date.now() };
  save('link', l);
  return l;
}

// Connect only: the wallet shares its address (eth_requestAccounts), nothing is signed.
// Enough to bring your own seekers aboard; posting on the board needs the link above.
export async function connect(provider) {
  const accounts = await provider.request({ method: 'eth_requestAccounts' });
  const address = accounts && accounts[0] && accounts[0].toLowerCase();
  if (!address || !/^0x[0-9a-f]{40}$/.test(address)) throw new Error('The wallet shared no address');
  save('wallet', { address });
  return address;
}
// The connected address (or remember one), or null.
export function connected(address) {
  if (address) { save('wallet', { address: address.toLowerCase() }); return address.toLowerCase(); }
  const w = load('wallet', null);
  return w && /^0x[0-9a-f]{40}$/.test(w.address || '') ? w.address : null;
}
export function disconnect() { remove('wallet'); }

export function savedLink(boardKey) {
  const l = load('link', null);
  return l && l.boardKey === boardKey && checkLink(l.address, l.boardKey, l.signature) ? l : null;
}
export function forget() { remove('link'); }
