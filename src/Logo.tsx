/**
 * A subject's logo: its checked PNG as a data: URL inside a fixed square tile, or the same tile with the first letter
 * of its name. The tile never grows or shrinks: its width and height are fixed and it does not flex. The image is
 * scaled to fit inside it (object-fit: contain), never cropped, never stretched and never larger than the tile, on a
 * light neutral background, with the same corner radius and no outline for every project.
 */
import { useState } from "react";
import { initialOf } from "./lookup";

export type LogoSize = 20 | 40 | 44;

export function SubjectLogo({ name, logo, size }: { name: string; logo: string | null | undefined; size: LogoSize }) {
  // The data: URL that failed to decode, if any: it falls back to the same letter tile as no logo at all.
  const [failed, setFailed] = useState<string | null>(null);
  const style = { width: size, height: size, minWidth: size, minHeight: size, maxWidth: size, maxHeight: size };
  // Only a data: URL made from bytes checked against the result file's hash; never a URL on another site.
  if (logo && logo.startsWith("data:image/png;base64,") && failed !== logo)
    return (
      <span className={`logo logo-${size} logo-img`} style={style}>
        <img
          src={logo}
          alt=""
          decoding="async"
          onError={() => setFailed(logo)}
          onLoad={(e) => {
            // A job with no square icon writes a 1 by 1 transparent PNG: that is no logo, so the letter tile shows.
            if (e.currentTarget.naturalWidth <= 2 || e.currentTarget.naturalHeight <= 2) setFailed(logo);
          }}
        />
      </span>
    );
  return (
    <span className={`logo logo-${size} logo-tile`} style={style} aria-hidden="true">
      {initialOf(name)}
    </span>
  );
}
