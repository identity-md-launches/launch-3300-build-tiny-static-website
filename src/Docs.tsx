/** How it works (#/docs): plain words, short sections. Price, addresses and file hashes come from the site's constants. */
import { useEffect } from "react";
import { ETHERSCAN, IMD, INTAKE } from "./config";
import { INSTRUCTIONS } from "./instructions";
import { PUBLISHED_INSTRUCTIONS } from "./counts";
import { KindMark } from "./Record";
import { subjectHref } from "./route";
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
  "Reading the record from your own code",
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
      <header className="doc-intro">
        <h1 id="docs-title" tabIndex={-1}>
          What a project says, next to what can be proven.
        </h1>
        <p className="lead">
          Every page here is built from sources: the project's own site, its contracts, and what others have written. Each line is marked by who said it and whether anyone can check it. The research is done by the IMD swarm. Anyone can add a source or dispute a line.
        </p>
        <p className="doc-actions">
          <a className="btn btn-primary" href="#/">Look up a project</a>
          <a className="btn" href={subjectHref("imdusd.com")}>See an example page</a>
        </p>
      </header>
      <Section title="What this is">
        <p>A public record of what projects say, next to what can be proven. Anyone can add a project or a source. The IMD swarm does the research and the checking.</p>
      </Section>
      <Section title="Why">
        <p>What a project says is spread over sites, posts and contracts. It is hard to tell what has been checked from what has only been said.</p>
      </Section>
      <Section title="Three kinds of line">
        <p>One fact, ZORA's total supply, shown the three ways a line can carry it:</p>
        <ul className="doc-kinds" aria-label="One fact, three kinds of line">
          <li className="doc-kind">
            <p className="doc-kind-head">
              <KindMark kind="claim" /> Someone else says it
            </p>
            <p>A news site reports that ZORA has a supply of ten billion.</p>
          </li>
          <li className="doc-kind">
            <p className="doc-kind-head">
              <KindMark kind="statement" /> The project says it
            </p>
            <p>zora.co states a total supply of 10,000,000,000 ZORA.</p>
          </li>
          <li className="doc-kind">
            <p className="doc-kind-head">
              <KindMark kind="proof" /> Anyone can check it
            </p>
            <p>The token contract on Base reports a total supply of ten billion.</p>
            <p className="small">To run it again: on Base, call <span className="mono">totalSupply()</span> on the ZORA token contract and divide by 10<sup>18</sup>. The line gives the contract, the block and a public RPC.</p>
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
        <ol className="doc-flow" aria-label="From your wallet to this page, in five steps">
          {["Your wallet", "IMD Intake contract", "A swarm job", "Result files on IMD's API", "This site, in your browser"].map((step, i) => (
            <li key={step} className="doc-step">
              {i > 0 && <span className="doc-arrow" aria-hidden="true" />}
              <span className="doc-box">{step}</span>
            </li>
          ))}
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
      <Section title="Reading the record from your own code">
        <ol className="doc-steps">
          <li>
            Find a subject's jobs in the Intake's <span className="mono">Requested</span> logs on Ethereum: the request body's tag is <span className="mono">{'{"app":"rec-test-1","kind":"add","subject":"example.com"}'}</span>. Keep only jobs whose objective matches the published template (see Which jobs count).
          </li>
          <li>
            The matching <span className="mono">Completed</span> log gives the result hash. Fetch the result file from <span className="mono">https://api.imd.fun/artifacts/&lt;hash&gt;</span>; the newest counted page job is the page.
          </li>
          <li>
            Its main fields: <span className="mono">lines</span> (each with id, kind, text, by, sources, quote and rerun), <span className="mono">infobox</span> (the key facts, each naming the line ids it rests on), <span className="mono">summary</span> (sentences with their line ids) and <span className="mono">sources</span> (what was read, and when).
          </li>
          <li>
            Cite a line by the explorer job that first wrote it and its line id, such as <span className="mono">job-id:L3</span>.
          </li>
        </ol>
        <p>
          <a href="./agents.md">agents.md</a> has the exact routes, bodies and field lists.
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
