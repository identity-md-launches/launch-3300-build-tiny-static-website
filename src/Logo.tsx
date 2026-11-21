/** A subject's logo: its checked PNG as a data: URL, or a tile with the first letter of its name. */
import { useState } from "react";
import { initialOf } from "./lookup";

export function SubjectLogo({ name, logo, size }: { name: string; logo: string | null | undefined; size: 28 | 40 }) {
  // The data: URL that failed to decode, if any: it falls back to the same letter tile as no logo at all.
  const [failed, setFailed] = useState<string | null>(null);
  // A logo smaller than 64 pixels is shown at its real size, centred on its tile, never stretched.
  const [small, setSmall] = useState(false);
  // Only a data: URL made from bytes checked against the result file's hash; never a URL on another site.
  if (logo && logo.startsWith("data:image/png;base64,") && failed !== logo)
    return (
      <img
        className={`logo logo-${size}${small ? " logo-small" : ""}`}
        src={logo}
        width={size}
        height={size}
        alt=""
        decoding="async"
        onError={() => setFailed(logo)}
        onLoad={(e) => {
          const w = e.currentTarget.naturalWidth;
          if (!w) setFailed(logo);
          else setSmall(w < 64 || e.currentTarget.naturalHeight < 64);
        }}
      />
    );
  return (
    <span className={`logo logo-${size} logo-tile`} aria-hidden="true">
      {initialOf(name)}
    </span>
  );
}
