import type { ReactNode } from "react";
/**
 * The three kinds' line icons, drawn in the badge's own colour (currentColor): Proof a tick in a circle, Statement a
 * megaphone, Claim a speech bubble. They sit beside a badge's or count's text, never in place of it. Any other tone
 * (contradicted, superseded) keeps its plain dot.
 */

/** A tone as the site names it ("proof", "proven", "statement", "claim", ...) to the icon it shows, if any. */
export function iconKind(tone: string): "proof" | "statement" | "claim" | null {
  if (tone === "proof" || tone === "proven") return "proof";
  if (tone === "statement" || tone === "stated") return "statement";
  if (tone === "claim" || tone === "claimed") return "claim";
  return null;
}

const PATHS: Record<"proof" | "statement" | "claim", ReactNode> = {
  proof: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M8.2 12.3l2.6 2.6 5-5.3" />
    </>
  ),
  statement: (
    <>
      <path d="M4 10v4h3l8 4.5v-13L7 10H4z" />
      <path d="M7.5 14.2l1.3 4.3h2.4" />
      <path d="M18 9.2a3.8 3.8 0 0 1 0 5.6" />
    </>
  ),
  claim: <path d="M5.5 5h13A1.5 1.5 0 0 1 20 6.5v8a1.5 1.5 0 0 1-1.5 1.5H11l-4 3.5V16H5.5A1.5 1.5 0 0 1 4 14.5v-8A1.5 1.5 0 0 1 5.5 5z" />,
};

/** The icon of a kind, at the size given (pixels, default 14). */
export function KindIcon({ kind, size = 14, className }: { kind: "proof" | "statement" | "claim"; size?: number; className?: string }) {
  return (
    <svg className={`kicon${className ? ` ${className}` : ""}`} viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {PATHS[kind]}
    </svg>
  );
}

/** What a badge or count shows before its text: the kind's icon, or the plain dot for any other tone. */
export function ToneMark({ tone }: { tone: string }) {
  const k = iconKind(tone);
  return k ? <KindIcon kind={k} /> : <span className="dot" aria-hidden="true" />;
}
