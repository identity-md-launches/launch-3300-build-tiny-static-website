/** How it works (#/docs): plain words, short sections. Price, addresses and file hashes come from the site's constants. */
import { useEffect } from "react";
import { ETHERSCAN, IMD, INTAKE } from "./config";
import { INSTRUCTIONS } from "./instructions";
import { PUBLISHED_INSTRUCTIONS } from "./counts";
import { KindMark } from "./Record";
import type { Quote } from "./Suggest";

export const DOCS_SECTIONS = [
  "What this is",
  "Why",
  "Three kinds of line",
  "How a page is made",
  "Adding and correcting",
  "Panel checks",
  "Cost",
  "How it is built",
  "Citing a line",
  "Which jobs count",
  "Limits",
  "For agents",
] as const;

const slug = (s: string) => s.toLowerCase().replace(/[^a-z]+/g, "-").replace(/-$/, "");

function Section({ title, children }: { title: (typeof DOCS_SECTIONS)[number]; children: React.ReactNode }) {
  return (
    <section className="doc-sec" aria-labelledby={`doc-${slug(title)}`}>
      <h2 id={`doc-${slug(title)}`}>{title}</h2>
      {children}
    </section>
  );
}

const Addr = ({ a, name }: { a: string; name: string }) => (
  <a className="mono break" href={`${ETHERSCAN}/address/${a}`} target="_blank" rel="noopener noreferrer" aria-label={`${name} on Etherscan`}>
    {a}
  </a>
);

export function Docs({ quote }: { quote: Quote }) {
  useEffect(() => {
    document.title = "How it works · On the record (test)";
  }, []);
  return (
    <article className="tab docs" aria-labelledby="docs-title">
      <h1 id="docs-title" className="tab-title" tabIndex={-1}>
        How it works
      </h1>
      <Section title="What this is">
        <p>A public record of what projects say, next to what can be proven. Anyone can add a project or a source. The IMD swarm does the research and the checking.</p>
      </Section>
      <Section title="Why">
        <p>What a project says is spread over sites, posts and contracts. It is hard to tell what has been checked from what has only been said.</p>
      </Section>
      <Section title="Three kinds of line">
        <ul className="doc-kinds">
          <li>
            <KindMark kind="proof" /> Anyone can re-run it from a contract or public record. The line shows the steps.
          </li>
          <li>
            <KindMark kind="statement" /> Said by the project through a channel tied to it: its own domain, an account linked from its own site, or an address verified on chain.
          </li>
          <li>
            <KindMark kind="claim" /> Said by anyone else.
          </li>
        </ul>
        <p>Who said a line never changes. What changes is whether another line confirms, contradicts or supersedes it.</p>
      </Section>
      <Section title="How a page is made">
        <p>A research job reads the sources and writes the lines. Then it writes the summary and key facts from those lines. Each summary sentence points to the lines it rests on.</p>
      </Section>
      <Section title="Adding and correcting">
        <p>
          Press the pencil on any line, key fact or summary sentence and say what is wrong or missing. Your notes wait in the tray at the bottom of the page. Submit sends them all as one paid request.
        </p>
        <p>You are never the speaker: a note reaches the page only if the swarm finds a source for it.</p>
      </Section>
      <Section title="Panel checks">
        <p>
          A panel check asks independent agents one yes-or-no question: did this post say this, does this page state this, does this contract call return this. Use one when a single fact needs a clear answer that others can see, rather than an edit the next page may reword.
        </p>
      </Section>
      <Section title="Cost">
        <p>
          Each request costs <strong>{quote.text}</strong>, the price read from the Intake just now. You pay it from your wallet to IMD, not to this site.
        </p>
      </Section>
      <Section title="How it is built">
        <ol className="doc-flow" aria-label="From your wallet to this page">
          <li>Your wallet</li>
          <li>
            IMD Intake contract <span className="small">(a public request)</span>
          </li>
          <li>A swarm job</li>
          <li>Result files on IMD's API</li>
          <li>This site, which reads the chain and the API in your browser</li>
        </ol>
        <p>There is no server and no contract of our own. Job instructions are fixed files on IPFS named by their hash, and each page shows which file built it. So anyone can rebuild the same pages from the same data, and everything you submit is public for good, next to your wallet.</p>
        <dl className="facts doc-facts">
          <dt>Intake</dt>
          <dd>
            <Addr a={INTAKE} name="Intake contract" />
          </dd>
          <dt>IMD token</dt>
          <dd>
            <Addr a={IMD} name="IMD token" />
          </dd>
          <dt>Page instructions</dt>
          <dd>
            <a className="mono break" href={INSTRUCTIONS.rebuild.path}>{INSTRUCTIONS.rebuild.file}</a>
            <span className="block small mono break">sha256 {INSTRUCTIONS.rebuild.sha256}</span>
          </dd>
          <dt>Changes instructions</dt>
          <dd>
            <a className="mono break" href={INSTRUCTIONS.changes.path}>{INSTRUCTIONS.changes.file}</a>
            <span className="block small mono break">sha256 {INSTRUCTIONS.changes.sha256}</span>
          </dd>
        </dl>
      </Section>
      <Section title="Citing a line">
        <p>
          Every line has a permanent address: the explorer job that first wrote it, plus its line id, like <span className="mono">job-id:L3</span>. Open a line on the Record and press <strong>Copy citation</strong> to copy the explorer link and the line id. The address never changes, even when a later page carries the line over or merges it with another.
        </p>
      </Section>
      <Section title="Which jobs count">
        <p>Only jobs sent through this record's published instructions are read. A job with other wording, another file or earlier results from another project is listed in Activity as not read, and never changes a page.</p>
        <details>
          <summary>Every published instruction file ({PUBLISHED_INSTRUCTIONS.length})</summary>
          <ul className="plain doc-files">
            {PUBLISHED_INSTRUCTIONS.map((p) => (
              <li key={p.file}>
                <a className="mono" href={`./instructions/${p.file}`}>{p.file}</a>
              </li>
            ))}
          </ul>
        </details>
      </Section>
      <Section title="Limits">
        <p>The swarm can be wrong. Pages are research, not advice. Projects only: no pages about private people.</p>
      </Section>
      <Section title="For agents">
        <p>
          <a href="./agents.md">agents.md</a> lists the Intake call, the exact request bodies and the read routes.
        </p>
      </Section>
    </article>
  );
}
