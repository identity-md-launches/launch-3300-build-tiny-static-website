/**
 * The registrable domain of a host, by the Public Suffix List's rules (https://publicsuffix.org/list/): the
 * longest matching suffix rule wins, a "*." rule matches any one label, a "!" rule is an exception that makes the
 * suffix one label shorter, and when no rule matches the suffix is the last label ("*"). The registrable domain
 * is the public suffix plus one label.
 *
 * The site carries a compact copy of the list: every generic and country top-level domain is covered by the
 * default "*" rule, and below are the multi-label ICANN suffixes in common use plus the PRIVATE section's shared
 * hosting suffixes, where each customer owns only its own subdomain (github.io, vercel.app, netlify.app,
 * pages.dev, imd.site and the like). Pure, for tests.
 */

const ICANN = [
  // United Kingdom, Japan, Australia, New Zealand, South Africa, India, Brazil, and other second-level schemes.
  "ac.uk co.uk gov.uk ltd.uk me.uk net.uk nhs.uk org.uk plc.uk police.uk sch.uk",
  "ac.jp co.jp ed.jp go.jp gr.jp lg.jp ne.jp or.jp",
  "asn.au com.au edu.au gov.au id.au net.au org.au",
  "ac.nz co.nz geek.nz gen.nz govt.nz iwi.nz kiwi.nz maori.nz net.nz org.nz school.nz",
  "ac.za co.za edu.za gov.za net.za org.za web.za",
  "ac.in co.in edu.in firm.in gen.in gov.in ind.in net.in org.in res.in",
  "com.br edu.br gov.br net.br org.br",
  "com.cn edu.cn gov.cn net.cn org.cn",
  "com.hk edu.hk gov.hk net.hk org.hk",
  "com.tw edu.tw gov.tw net.tw org.tw idv.tw",
  "co.kr go.kr ne.kr or.kr re.kr",
  "com.sg edu.sg gov.sg net.sg org.sg",
  "com.my edu.my gov.my net.my org.my",
  "co.id or.id web.id",
  "co.th in.th or.th",
  "com.vn net.vn org.vn",
  "com.ph net.ph org.ph",
  "com.pk net.pk org.pk",
  "com.tr net.tr org.tr gen.tr",
  "com.mx net.mx org.mx gob.mx",
  "com.ar net.ar org.ar gob.ar",
  "com.co net.co org.co",
  "com.pe net.pe org.pe",
  "co.ve com.ve",
  "com.ua net.ua org.ua in.ua",
  "com.ru net.ru org.ru",
  "co.il org.il ac.il",
  "com.sa net.sa org.sa",
  "co.ke or.ke",
  "com.ng org.ng",
  "com.eg org.eg",
  "co.at or.at",
  "co.hu",
  "com.pl net.pl org.pl",
  "com.es org.es",
  "com.pt",
  "co.it",
  "com.gr",
  "com.cy",
  "com.mt",
  "co.uz",
  "com.de",
  "com.fr",
].join(" ");

const PRIVATE = [
  // Code and static hosting where every project lives on its own subdomain.
  "github.io githubusercontent.com gitlab.io bitbucket.io codeberg.page",
  "vercel.app vercel.dev now.sh netlify.app netlify.com pages.dev workers.dev",
  "web.app firebaseapp.com appspot.com run.app",
  "herokuapp.com onrender.com fly.dev railway.app up.railway.app deno.dev glitch.me replit.app repl.co",
  "surge.sh neocities.org readthedocs.io gitbook.io notion.site webflow.io framer.app framer.website",
  "azurewebsites.net cloudfront.net amazonaws.com s3.amazonaws.com azurestaticapps.net",
  "blogspot.com wordpress.com substack.com medium.com",
  // Web3 gateways and hosting.
  "eth.limo eth.link ipfs.dweb.link fleek.co on.fleek.co 4everland.app",
  // IMD's own shared host: each site on it is its own project.
  "imd.site",
].join(" ");

const RULES = new Set(`${ICANN} ${PRIVATE}`.split(/\s+/).filter(Boolean));
/** The site's extra shared hosts, listed for tests and the README. */
export const SHARED_HOSTS = PRIVATE.split(/\s+/).filter(Boolean);

/** The public suffix of a host, as labels counted from the right. */
function suffixLength(labels: string[]): number {
  let best = 1; // the default "*" rule
  for (let i = 0; i < labels.length; i++) {
    const cand = labels.slice(i).join(".");
    const wild = ["*", ...labels.slice(i + 1)].join(".");
    if (RULES.has(`!${cand}`)) return labels.length - i - 1;
    if (RULES.has(cand) || RULES.has(wild)) best = Math.max(best, labels.length - i);
  }
  return best;
}

/** The public suffix of a host: "co.uk" for "a.b.co.uk", "github.io" for "me.github.io", "org" for "app.uniswap.org". */
export function publicSuffix(host: string): string {
  const labels = host.toLowerCase().replace(/\.$/, "").split(".").filter(Boolean);
  if (!labels.length) return "";
  return labels.slice(labels.length - suffixLength(labels)).join(".");
}

/**
 * The registrable domain of a host: its public suffix plus one label. "uniswap.org" for "app.uniswap.org",
 * "me.github.io" for "docs.me.github.io". A host that is itself a public suffix (such as "github.io") has none,
 * and is returned as it is.
 */
export function registrableDomain(host: string): string {
  const labels = host.toLowerCase().replace(/\.$/, "").split(".").filter(Boolean);
  if (!labels.length) return "";
  const n = suffixLength(labels);
  if (labels.length <= n) return labels.join(".");
  return labels.slice(labels.length - n - 1).join(".");
}

/** True when host is the registrable domain of `domain` or any subdomain of it. */
export function sameSite(host: string, domain: string): boolean {
  const h = host.toLowerCase().replace(/^www\./, "").replace(/\.$/, "");
  const d = registrableDomain(domain.trim().toLowerCase().replace(/^www\./, ""));
  return !!h && !!d && (h === d || h.endsWith(`.${d}`));
}
