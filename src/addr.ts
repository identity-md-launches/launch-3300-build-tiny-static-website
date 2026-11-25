/**
 * Addresses of any chain: 0x (EVM, and 64-hex Sui/Aptos), base58 (Solana, Tron), bech32 (Cosmos, Bitcoin) and TON.
 * How each is shortened and which explorer opens it. Pure, for tests.
 */
const EVM = /^0x[0-9a-fA-F]{40}$/;
const HEX64 = /^0x[0-9a-fA-F]{64}$/;
const BASE58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const BECH32 = /^[a-z]{2,12}1[02-9ac-hj-np-z]{20,90}$/;
const TON = /^[EU]Q[A-Za-z0-9_-]{46}$/;

/** True for a base58 string that looks like a key, not a word: it mixes digits, capitals and small letters. */
const keyLike = (s: string) => /\d/.test(s) && /[A-Z]/.test(s) && /[a-z]/.test(s);

/** A non-0x address: Solana, Tron, Cosmos, Bitcoin, TON. */
export function isOtherAddress(v: string): boolean {
  const s = v.trim();
  return (BASE58.test(s) && keyLike(s)) || BECH32.test(s) || TON.test(s);
}
/** Any address this site shows as an address: a 0x address or a non-0x one. */
export const isAnyAddress = (v: string) => EVM.test(v.trim()) || HEX64.test(v.trim()) || isOtherAddress(v);

const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
/** How many bytes a base58 string decodes to; null when it is not base58. */
export function base58Length(v: string): number | null {
  if (!/^[1-9A-HJ-NP-Za-km-z]+$/.test(v)) return null;
  const bytes: number[] = [];
  for (const ch of v) {
    let carry = B58.indexOf(ch);
    for (let i = 0; i < bytes.length; i++) {
      carry += bytes[i]! * 58;
      bytes[i] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }
  let zeros = 0;
  while (zeros < v.length && v[zeros] === "1") zeros++;
  return zeros + bytes.length;
}

/**
 * An address given in an address field with its chain named: checked against that chain, not against the look of a
 * word in prose. On Solana any base58 value that decodes to 32 bytes is an address (the system program
 * 11111111111111111111111111111111 included); elsewhere the general test applies.
 */
export function isAddressFor(v: string, chain = ""): boolean {
  const s = v.trim();
  if (isAnyAddress(s)) return true;
  if (/solana/i.test(chain)) return base58Length(s) === 32;
  if (/tron/i.test(chain)) return /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(s) && base58Length(s) === 25;
  return false;
}

/** Non-0x addresses inside a text: base58 keys (mixed digits and letters), bech32 and TON. */
export const OTHER_ADDRESS_IN = /(?<![A-Za-z0-9])(?:[1-9A-HJ-NP-Za-km-z]{32,44}|[a-z]{2,12}1[02-9ac-hj-np-z]{20,90}|[EU]Q[A-Za-z0-9_-]{46})(?![A-Za-z0-9_-])/g;

/**
 * The short form of an address. A 0x address that begins with four or more zeros is "0x0…" and its last 6 characters,
 * so a vanity address stays readable; another 0x address is its first 6 and last 4; any other address its first 4 and
 * last 4.
 */
export function shortAddr(a: string): string {
  if (/^0x0{4,}/i.test(a)) return `0x0…${a.slice(-6)}`;
  if (/^0x/i.test(a)) return a.length <= 12 ? a : `${a.slice(0, 6)}…${a.slice(-4)}`;
  return a.length <= 10 ? a : `${a.slice(0, 4)}…${a.slice(-4)}`;
}

/** The explorer page of a non-0x address on its chain, or "" when the chain is not known. */
export function otherExplorerUrl(address: string, chain = ""): string {
  const c = chain.toLowerCase();
  const a = encodeURIComponent(address);
  if (/solana/.test(c)) return /devnet/.test(c) ? `https://solscan.io/account/${a}?cluster=devnet` : /testnet/.test(c) ? `https://solscan.io/account/${a}?cluster=testnet` : `https://solscan.io/account/${a}`;
  if (/tron/.test(c)) return `https://tronscan.org/#/address/${a}`;
  if (/\bsui\b/.test(c)) return `https://suivision.xyz/account/${a}`;
  if (/aptos/.test(c)) return `https://explorer.aptoslabs.com/account/${a}`;
  if (/\bton\b/.test(c)) return `https://tonviewer.com/${a}`;
  if (/bitcoin|\bbtc\b/.test(c)) return `https://mempool.space/address/${a}`;
  if (/cosmos/.test(c)) return `https://www.mintscan.io/cosmos/address/${a}`;
  if (/near/.test(c)) return `https://nearblocks.io/address/${a}`;
  // No chain written: the address's own form names it when only one chain uses it.
  if (!c) {
    if (/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(address)) return `https://tronscan.org/#/address/${a}`;
    if (BASE58.test(address) && keyLike(address)) return `https://solscan.io/account/${a}`;
    if (/^bc1/.test(address)) return `https://mempool.space/address/${a}`;
    if (/^cosmos1/.test(address)) return `https://www.mintscan.io/cosmos/address/${a}`;
    if (TON.test(address)) return `https://tonviewer.com/${a}`;
  }
  return "";
}
