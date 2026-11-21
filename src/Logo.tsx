/** A subject's logo: its checked PNG as a data: URL, or a tile with the first letter of its name. */
import { useState } from "react";
import { initialOf } from "./lookup";

export function SubjectLogo({ name, logo, size }: { name: string; logo: string | null | undefined; size: 28 | 40 }) {
  // The data: URL that failed to decode, if any: it falls back to the same letter tile as no logo at all.
  const [failed, setFailed] = useState<string | null>(null);
  // A logo smaller than 64 pixels is shown at its real size, centred on its tile, never stretched or shrunk: the
  // tile grows to at least the image's own width and height.
  const [small, setSmall] = useState<{ src: string; w: number; h: number } | null>(null);
  // Only a data: URL made from bytes checked against the result file's hash; never a URL on another site.
  if (logo && logo.startsWith("data:image/png;base64,") && failed !== logo) {
    if (small && small.src === logo)
      return (
        <span className={`logo logo-${size} logo-frame`} style={{ width: Math.max(size, small.w), height: Math.max(size, small.h) }}>
          <img className="logo-real" src={logo} width={small.w} height={small.h} style={{ width: small.w, height: small.h }} alt="" decoding="async" onError={() => setFailed(logo)} />
        </span>
      );
    return (
      <img
        className={`logo logo-${size}`}
        src={logo}
        width={size}
        height={size}
        alt=""
        decoding="async"
        onError={() => setFailed(logo)}
        onLoad={(e) => {
          const w = e.currentTarget.naturalWidth;
          const h = e.currentTarget.naturalHeight;
          if (!w) setFailed(logo);
          else if (w < 64 || h < 64) setSmall({ src: logo, w, h });
        }}
      />
    );
  }
  return (
    <span className={`logo logo-${size} logo-tile`} aria-hidden="true">
      {initialOf(name)}
    </span>
  );
}
