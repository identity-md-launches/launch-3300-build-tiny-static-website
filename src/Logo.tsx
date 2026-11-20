/** A subject's logo: its checked PNG as a data: URL, or a tile with the first letter of its name. */
import { initialOf } from "./lookup";

export function SubjectLogo({ name, logo, size }: { name: string; logo: string | null | undefined; size: 28 | 40 }) {
  // Only a data: URL made from bytes checked against the result file's hash; never a URL on another site.
  if (logo && logo.startsWith("data:image/png;base64,"))
    return <img className={`logo logo-${size}`} src={logo} width={size} height={size} alt="" decoding="async" />;
  return (
    <span className={`logo logo-${size} logo-tile`} aria-hidden="true">
      {initialOf(name)}
    </span>
  );
}
