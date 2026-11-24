/** How Swarmpedia works (#/docs): two groups, For readers and For builders, with an "On this page" menu. */
import { useEffect } from "react";
import { ETHERSCAN, IMD, INTAKE } from "./config";
import { INSTRUCTIONS } from "./instructions";
import { PUBLISHED_INSTRUCTIONS } from "./counts";
import { CopyIcon } from "./Record";
import { EXAMPLE_FALLBACK, ExampleCards, ExampleFrom, isZoraExample, type Example } from "./Home";
import type { Digest } from "./model";
import { subjectHref } from "./route";
import type { Quote } from "./Suggest";

export const READER_SECTIONS = ["Three kinds of line", "Reading a page", "Adding and correcting", "Cost", "Limits"] as const;
export const BUILDER_SECTIONS = ["How it is built", "Addresses and instruction files", "Citing a line", "Reading the record from your own code", "Which jobs count"] as const;
export const DOCS_SECTIONS = [...READER_SECTIONS, ...BUILDER_SECTIONS] as const;
type Title = (typeof DOCS_SECTIONS)[number];

export const slug = (s: string) => s.toLowerCase().replace(/[^a-z]+/g, "-").replace(/-$/, "");

function Section({ title, children }: { title: Title; children: React.ReactNode }) {
  return (
    <section className="doc-sec" id={`doc-${slug(title)}`} aria-labelledby={`doc-${slug(title)}-h`}>
      <h2 id={`doc-${slug(title)}-h`}>{title}</h2>
      {children}
    </section>
  );
}

/** An address or hash in monospace with its copy button; an address links to Etherscan. */
function Mono({ value, href, label }: { value: string; href?: string; label: string }) {
  return (
    <span className="doc-mono">
      {href ? (
        <a className="mono break" href={href} target="_blank" rel="noopener noreferrer" aria-label={`${label} on Etherscan`}>{value}</a>
      ) : (
        <span className="mono break">{value}</span>
      )}
      <CopyIcon value={value} label={`Copy ${label}`} />
    </span>
  );
}

/** "On this page": a sticky column on wide screens, a row of links under the heading on narrow ones. */
function Toc() {
  const go = (t: Title) => (e: React.MouseEvent) => {
    e.preventDefault();
    document.getElementById(`doc-${slug(t)}`)?.scrollIntoView({ block: "start" });
  };
  return (
    <nav className="doc-toc" aria-label="On this page">
      <p className="doc-toc-title">On this page</p>
      <p className="doc-toc-group">For readers</p>
      <ul>
        {READER_SECTIONS.map((t) => (
          <li key={t}><a href={`#doc-${slug(t)}`} onClick={go(t)}>{t}</a></li>
        ))}
      </ul>
      <p className="doc-toc-group">For builders</p>
      <ul>
        {BUILDER_SECTIONS.map((t) => (
          <li key={t}><a href={`#doc-${slug(t)}`} onClick={go(t)}>{t}</a></li>
        ))}
      </ul>
    </nav>
  );
}

export function Docs({ quote, example = { ...EXAMPLE_FALLBACK, from: null, name: null, logoHash: null }, digests, logos }: { quote: Quote; example?: Example; digests?: Map<string, Digest>; logos?: Map<string, string> }) {
  const zora = isZoraExample(example);
  useEffect(() => {
    document.title = "How Swarmpedia works · Swarmpedia";
  }, []);
  return (
    <article className="tab docs" aria-labelledby="docs-title">
      <header className="doc-intro">
        <h1 id="docs-title" tabIndex={-1}>How Swarmpedia works</h1>
        <p className="lead">
          Swarmpedia is a public record of projects. The IMD swarm checks websites, posts and contracts, and each line shows who said it and
          whether you can verify it. Anyone can add a project or a source.
        </p>
        <p className="doc-actions">
          <a className="btn btn-primary" href="#/">Look up a project</a>
          <a className="btn" href={subjectHref("imdusd.com")}>See an example page</a>
        </p>
      </header>
      <div className="doc-layout">
        <Toc />
        <div className="doc-body">
          <h2 className="doc-group">For readers</h2>
          <Section title="Three kinds of line">
            <p>{zora ? "One fact, ZORA's total supply, the three ways a line can carry it:" : "One fact, the three ways a line can carry it, as on the home page:"}</p>
            <div className="example doc-example">
              <ExampleCards example={example} label="One fact, three kinds of line" />
              <ExampleFrom example={example} digests={digests} logos={logos} />
            </div>
            {zora ? (
              <p>To run the proof again: on Base, call <span className="mono">totalSupply()</span> on the ZORA token contract and divide by 10<sup>18</sup>. The line gives the contract, the block and a public RPC.</p>
            ) : (
              <p>To run the proof again, open it in Record: its re-run steps give the chain, the contract or source, the block and a public RPC.</p>
            )}
            <p>Who said a line never changes. What changes is whether another line confirms, contradicts or supersedes it.</p>
          </Section>
          <Section title="Reading a page">
            <p>A research job reads the sources and writes the lines. Then it writes the summary and key facts from those lines. Each summary sentence ends with the icon of each kind of line it rests on; press it to open those lines in Record.</p>
            <p>Key facts marked "test network" or "past" are listed after the live ones. "Not known yet" lists what the sources did not answer.</p>
          </Section>
          <Section title="Adding and correcting">
            <p>On Contribute, write what is wrong or missing in your own words, and add links if you have them. The pencil on a line, key fact or summary sentence opens the same form about that item. Your notes wait in the tray at the bottom of the page, and several notes go as one request.</p>
            <p>The swarm adds what holds up and gives a reason for the rest. You are never the speaker: a note reaches the page only if the swarm finds a source for it.</p>
            <p>When you add a project, <strong>Research to start from</strong> takes links the swarm reads first. Every open question has <strong>Answer this</strong>, which starts a note "Answer to: …" that is checked like any other.</p>
          </Section>
          <Section title="Cost">
            <p>Each request costs <strong>{quote.text}</strong>, the price read from the Intake just now. You pay it from your wallet to IMD, not to this site.</p>
          </Section>
          <Section title="Limits">
            <ul className="doc-list">
              <li>The swarm can be wrong. Check the source of a line before you rely on it.</li>
              <li>A statement is what the project says, not proof that it is true.</li>
              <li>Pages are research, not advice.</li>
              <li>Projects only: no pages about private people.</li>
              <li>Everything you send is public for good, next to your wallet.</li>
            </ul>
          </Section>

          <hr className="doc-divider" />
          <h2 className="doc-group">For builders</h2>
          <Section title="How it is built">
            <ol className="doc-flow" aria-label="From your wallet to this page, in five steps">
              {["Your wallet", "IMD Intake contract", "A swarm job", "Result files on IMD's API", "This site, in your browser"].map((step, i) => (
                <li key={step} className="doc-step">
                  {i > 0 && <span className="doc-arrow" aria-hidden="true" />}
                  <span className="doc-box">{step}</span>
                </li>
              ))}
            </ol>
            <p>There is no server and no contract of our own. Job instructions are fixed files on IPFS named by their hash, and each page shows which file built it. So anyone can rebuild the same pages from the same data.</p>
          </Section>
          <Section title="Addresses and instruction files">
            <dl className="facts doc-facts">
              <dt>Intake</dt>
              <dd><Mono value={INTAKE} href={`${ETHERSCAN}/address/${INTAKE}`} label="Intake contract address" /></dd>
              <dt>IMD token</dt>
              <dd><Mono value={IMD} href={`${ETHERSCAN}/address/${IMD}`} label="IMD token address" /></dd>
              <dt>Page instructions</dt>
              <dd>
                <a className="mono break" href={INSTRUCTIONS.rebuild.path}>{INSTRUCTIONS.rebuild.file}</a>
                <span className="block small">sha256 <Mono value={INSTRUCTIONS.rebuild.sha256} label="page instructions sha256" /></span>
              </dd>
              <dt>Changes instructions</dt>
              <dd>
                <a className="mono break" href={INSTRUCTIONS.changes.path}>{INSTRUCTIONS.changes.file}</a>
                <span className="block small">sha256 <Mono value={INSTRUCTIONS.changes.sha256} label="changes instructions sha256" /></span>
              </dd>
            </dl>
          </Section>
          <Section title="Citing a line">
            <p>Every line has a permanent address: the explorer job that first wrote it, plus its line id, like <span className="mono">job-id:L3</span>. Open a line on the Record and press <strong>Copy citation</strong>. Open questions have the same kind of id, <span className="mono">job-id:q2</span>, and a link <span className="mono">#/s/&lt;project&gt;/q-…</span> that keeps working after the question is answered.</p>
          </Section>
          <Section title="Reading the record from your own code">
            <ol className="doc-steps">
              <li>Find a subject's jobs in the Intake's <span className="mono">Requested</span> logs on Ethereum: the request body's tag is <span className="mono">{'{"app":"rec-test-1","kind":"add","subject":"example.com"}'}</span>. Keep only jobs whose objective matches the site's template exactly (see Which jobs count).</li>
              <li>The matching <span className="mono">Completed</span> log gives the result hash. Fetch the result file from <span className="mono">https://api.imd.fun/artifacts/&lt;hash&gt;</span>; the newest counted page job is the page.</li>
              <li>Its main fields: <span className="mono">lines</span>, <span className="mono">infobox</span> (the key facts, each naming the line ids it rests on), <span className="mono">summary</span>, <span className="mono">sources</span> and <span className="mono">open_questions</span>.</li>
              <li>Cite a line by the explorer job that first wrote it and its line id, such as <span className="mono">job-id:L3</span>.</li>
            </ol>
            <p><a href="./agents.md">agents.md</a> has the exact routes, bodies and field lists.</p>
          </Section>
          <Section title="Which jobs count">
            <p>Only jobs sent through this record's published instructions are read. A job with other wording, another file or earlier results from another project is listed in Activity as not read, and never changes a page.</p>
            <details>
              <summary>Every published instruction file ({PUBLISHED_INSTRUCTIONS.length})</summary>
              <ul className="plain doc-files">
                {PUBLISHED_INSTRUCTIONS.map((p) => (
                  <li key={p.file}><a className="mono" href={`./instructions/${p.file}`}>{p.file}</a></li>
                ))}
              </ul>
            </details>
          </Section>
        </div>
      </div>
    </article>
  );
}
