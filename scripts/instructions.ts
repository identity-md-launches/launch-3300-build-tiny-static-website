/**
 * Publishes the standing instructions of each template as an immutable static file:
 * templates/instructions/<name>.txt is copied byte for byte to public/instructions/<name>-<first 12 hex of sha256>.txt,
 * and src/instructions.json records the current file and hash. A published file is never changed or removed: a new
 * wording gets a new name, and every old file stays in public/instructions/ so it keeps being served.
 * Run: npx vite-node scripts/instructions.ts (then npx vite-node scripts/agents-md.ts and npm run build).
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const NAMES = ["rebuild", "changes"] as const;
const manifest: Record<string, { file: string; sha256: string }> = {};
for (const name of NAMES) {
  const bytes = readFileSync(`templates/instructions/${name}.txt`);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const file = `${name}-${sha256.slice(0, 12)}.txt`;
  const out = `public/instructions/${file}`;
  if (existsSync(out)) {
    if (!readFileSync(out).equals(bytes)) throw new Error(`${out} exists with other bytes: a published file never changes`);
  } else writeFileSync(out, bytes);
  manifest[name] = { file, sha256 };
  console.log(`${name}: ${file} (${bytes.length} bytes)`);
}
writeFileSync("src/instructions.json", JSON.stringify(manifest, null, 2) + "\n");
