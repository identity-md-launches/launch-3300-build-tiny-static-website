/**
 * A subject is one project, named by its domain (lowercase host without "www.", such as imd.fun) or, when it
 * has none, by chain id and contract address (such as 1:0xabc…). Never by name, and never a person.
 */

/** Requests whose tag has no subject, and oracle questions with no "filed under" sentence, belong here. */
export const DEFAULT_SUBJECT = "imd.fun";

/** Chains IMD's oracle check lists (POST /requests/check, 2026-11-19), offered in the forms. */
export const CHAIN_CHOICES: { id: number; name: string }[] = [
  { id: 1, name: "Ethereum" },
  { id: 8453, name: "Base" },
  { id: 42161, name: "Arbitrum One" },
  { id: 56, name: "BNB Chain" },
  { id: 4663, name: "Robinhood Chain" },
  { id: 11155111, name: "Sepolia" },
];
/** The Add a project form's choice for a chain the list does not name; a numeric chain id is typed instead. */
export const OTHER_CHAIN = "other";
export const chainName = (id: number | string) => CHAIN_CHOICES.find((c) => String(c.id) === String(id))?.name ?? `chain ${id}`;

const HOST = /^(?=.{3,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{0,62}[a-z0-9]$/;
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

/** A domain from what a visitor typed: a bare host or a URL. Lowercase, no "www.", no port or path. "" when not a domain. */
export function normDomain(raw: string): string {
  const t = raw.trim().toLowerCase();
  if (!t) return "";
  let host = "";
  try {
    host = new URL(/^[a-z][a-z0-9+.-]*:\/\//.test(t) ? t : `https://${t}`).hostname;
  } catch {
    return "";
  }
  host = host.replace(/^www\./, "").replace(/\.$/, "");
  return HOST.test(host) ? host : "";
}

export const isAddress = (a: string) => ADDRESS.test(a.trim());

/** True for a subject id this site accepts: a domain as normDomain gives it, or "<chain id>:0x<40 hex>" in lowercase. */
export function isSubjectId(id: unknown): id is string {
  if (typeof id !== "string") return false;
  if (/^\d{1,12}:0x[0-9a-f]{40}$/.test(id)) return true;
  return normDomain(id) === id;
}

export interface SubjectInput {
  domain: string;
  address: string;
  chain: string;
}

/** The subject id for a form: the domain when there is one, else chain id and contract address. "" when neither is usable. */
export function subjectIdOf(s: SubjectInput): string {
  const d = normDomain(s.domain);
  if (d) return d;
  if (isAddress(s.address) && /^\d{1,12}$/.test(s.chain.trim()) && Number(s.chain) > 0) return `${Number(s.chain)}:${s.address.trim().toLowerCase()}`;
  return "";
}

/** One message per field that needs a fix. A domain, or a contract and chain, is required. */
export function validateSubject(s: SubjectInput): { domain?: string; address?: string; chain?: string } {
  const e: { domain?: string; address?: string; chain?: string } = {};
  const domain = s.domain.trim();
  const address = s.address.trim();
  if (domain && !normDomain(domain)) e.domain = "Write a domain such as example.com.";
  if (address && !isAddress(address)) e.address = "Use a contract address: 0x and 40 hex characters.";
  if (address && (!/^\d{1,12}$/.test(s.chain.trim()) || Number(s.chain) < 1)) e.chain = "Choose the chain the contract is on, or write its chain ID as a number, such as 137.";
  else if (!address && s.chain.trim() && !/^\d{1,12}$/.test(s.chain.trim())) e.chain = "Write the chain ID as a number, such as 137.";
  if (!domain && !address) e.domain = "Write the project's domain, or give its main contract below if it has none.";
  return e;
}

/** What a subject is, as it fills <SUBJECT>. */
export interface SubjectRef {
  id: string;
  domain: string;
  address: string;
  chainId: number | null;
}

/** The <SUBJECT> text: "the project at <domain>" plus ", whose main contract is <address> on chain <id>" when given. */
export function describeSubject(s: SubjectRef): string {
  const contract = s.address && s.chainId !== null ? `${s.address} on chain ${s.chainId}` : "";
  if (s.domain) return `the project at ${s.domain}${contract ? `, whose main contract is ${contract}` : ""}`;
  return `the project whose main contract is ${contract}`;
}

/** The parts of a subject id, without a contract for a domain id. */
export function refFromId(id: string): SubjectRef {
  const m = /^(\d+):(0x[0-9a-f]{40})$/.exec(id);
  return m ? { id, domain: "", address: m[2]!, chainId: Number(m[1]) } : { id, domain: id, address: "", chainId: null };
}

/** The subject a visitor's form describes, with the contract when they gave one. */
export function refFromInput(s: SubjectInput): SubjectRef {
  const id = subjectIdOf(s);
  const domain = normDomain(s.domain);
  const address = isAddress(s.address) ? s.address.trim() : "";
  return { id, domain, address, chainId: address && /^\d{1,12}$/.test(s.chain.trim()) && Number(s.chain) > 0 ? Number(s.chain) : null };
}

/** Reads the contract back out of an objective this site sent for a domain subject. */
export function contractFromObjective(objective: unknown, domain: string): { address: string; chainId: number } | null {
  if (typeof objective !== "string" || !domain) return null;
  const esc = domain.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = new RegExp(`the project at ${esc}, whose main contract is (0x[0-9a-fA-F]{40}) on chain (\\d+)`).exec(objective);
  return m ? { address: m[1]!, chainId: Number(m[2]) } : null;
}

/** A chain id from what a page writes in contracts[].chain: a number, or a chain's name. */
export function chainIdOf(v: string): number | null {
  const t = v.trim().toLowerCase();
  if (/^\d+$/.test(t)) return Number(t);
  if (/^(ethereum|ethereum mainnet|mainnet|eth)$/.test(t)) return 1;
  const c = CHAIN_CHOICES.find((x) => x.name.toLowerCase() === t || t.startsWith(x.name.toLowerCase()));
  return c ? c.id : null;
}
