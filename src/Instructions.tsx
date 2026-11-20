/** "Instructions this job follows": the instruction file an objective names, with its link, hash and full text. */
import { INSTRUCTIONS, paragraphsOf, type InstructionName } from "./instructions";

export function InstructionsBlock({ name, id }: { name: InstructionName; id?: string }) {
  const ins = INSTRUCTIONS[name];
  const headingId = `${id ?? `ins-${name}`}-h`;
  return (
    <section className="instructions" id={id} aria-labelledby={headingId}>
      <h4 id={headingId}>Instructions this job follows</h4>
      <p className="small break">
        The job fetches this file first and checks its hash. It is part of the request.{" "}
        <a href={ins.url} target="_blank" rel="noreferrer" className="mono">
          {ins.file}
        </a>
        , sha256 <span className="mono">{ins.sha256}</span>
      </p>
      <div className="objective ins-text">
        {paragraphsOf(ins.text).map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </div>
    </section>
  );
}
