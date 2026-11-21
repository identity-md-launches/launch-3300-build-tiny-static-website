/**
 * The registrable domain of a host, by the Public Suffix List's rules (https://publicsuffix.org/list/): the
 * longest matching suffix rule wins, a "*." rule matches any one label, a "!" rule is an exception that makes the
 * suffix one label shorter and wins over every other rule, and when no rule matches the suffix is the last label
 * ("*"). The registrable domain is the public suffix plus one label; a host that is itself a public suffix has none.
 *
 * The site carries the whole list, ICANN and PRIVATE sections alike (src/psl-rules.txt, generated from
 * public_suffix_list.dat by scripts/build-psl.mjs), so a project on a shared host such as github.io, vercel.app,
 * netlify.app or pages.dev owns only its own subdomain. SHARED_HOSTS adds the shared hosts the list does not name
 * (imd.site, IMD's own host, among them). Pure, for tests.
 */
import LIST from "./psl-rules.txt?raw";

/** Shared hosts treated as public suffixes on top of the list: each customer owns only its own subdomain. */
export const SHARED_HOSTS = [
  // The brief's own: code and static hosts where every project lives on its own subdomain, and IMD's shared host.
  "github.io", "vercel.app", "netlify.app", "pages.dev", "imd.site",
  // Further shared hosts the site kept from its earlier compact list; most are in the PSL already.
  "githubusercontent.com", "gitlab.io", "bitbucket.io", "codeberg.page", "vercel.dev", "now.sh", "netlify.com", "workers.dev",
  "web.app", "firebaseapp.com", "appspot.com", "run.app", "herokuapp.com", "onrender.com", "fly.dev", "railway.app", "up.railway.app",
  "deno.dev", "glitch.me", "replit.app", "repl.co", "surge.sh", "neocities.org", "readthedocs.io", "gitbook.io", "notion.site",
  "webflow.io", "framer.app", "framer.website", "azurewebsites.net", "cloudfront.net", "azurestaticapps.net", "blogspot.com",
  "wordpress.com", "substack.com", "medium.com", "eth.limo", "eth.link", "ipfs.dweb.link", "fleek.co", "on.fleek.co", "4everland.app",
];

const RULES = new Set<string>([
  ...LIST.split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("//")),
  ...SHARED_HOSTS,
]);
/** How many rules the site holds, for tests. */
export const RULE_COUNT = RULES.size;

/** A host as lower-case ASCII labels: punycode for internationalised names, no trailing dot. Null when not a host. */
function labelsOf(host: string): string[] | null {
  let h = host.trim().toLowerCase();
  if (!h || h.startsWith(".")) return null;
  h = h.replace(/\.$/, "");
  if (/[^a-z0-9.-]/.test(h)) {
    try {
      h = new URL(`http://${h}`).hostname;
    } catch {
      return null;
    }
  }
  const labels = h.split(".");
  return labels.every(Boolean) ? labels : null;
}

/** The public suffix of a host, as a count of labels from the right. */
function suffixLength(labels: string[]): number {
  // An exception rule wins over every other rule: the suffix is the exception less its leftmost label.
  for (let i = 0; i < labels.length; i++) if (RULES.has(`!${labels.slice(i).join(".")}`)) return labels.length - i - 1;
  for (let i = 0; i < labels.length; i++) {
    // Leftmost first, so the first rule that matches is the longest.
    if (RULES.has(labels.slice(i).join(".")) || (i + 1 < labels.length && RULES.has(["*", ...labels.slice(i + 1)].join(".")))) return labels.length - i;
  }
  return 1; // the default "*" rule
}

/** The public suffix of a host: "co.uk" for "a.b.co.uk", "github.io" for "me.github.io", "org" for "app.uniswap.org". */
export function publicSuffix(host: string): string {
  const labels = labelsOf(host);
  if (!labels) return "";
  return labels.slice(labels.length - suffixLength(labels)).join(".");
}

/**
 * The registrable domain of a host: its public suffix plus one label. "uniswap.org" for "app.uniswap.org",
 * "me.github.io" for "docs.me.github.io", "test.k12.ak.us" for "app.test.k12.ak.us". "" for a host that is itself a
 * public suffix (such as "github.io" or "k12.ak.us"): it has no registrable domain.
 */
export function registrableDomain(host: string): string {
  const labels = labelsOf(host);
  if (!labels) return "";
  const n = suffixLength(labels);
  if (labels.length <= n) return "";
  return labels.slice(labels.length - n - 1).join(".");
}

/**
 * True when host belongs to the subject `domain`: both have the same registrable domain, each resolved from its
 * full hostname, so "www." is a label like any other ("www.uniswap.org" is uniswap.org's, while "www.github.io" is
 * the tenant "www" on github.io). A subject that is itself a public suffix owns no other host: only an identical host
 * matches it, so "other.github.io" never belongs to "github.io", nor "other-school.k12.ak.us" to "test.k12.ak.us".
 */
export function sameSite(host: string, domain: string): boolean {
  const h = labelsOf(host)?.join(".") ?? "";
  const d = labelsOf(domain)?.join(".") ?? "";
  if (!h || !d) return false;
  const rd = registrableDomain(d);
  if (!rd) return h === d;
  return registrableDomain(h) === rd;
}
