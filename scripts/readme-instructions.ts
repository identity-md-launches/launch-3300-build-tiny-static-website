/**
 * Writes the current instruction files' gateway addresses and sha256 into README.md, between the
 * "instructions:start" and "instructions:end" markers, from src/instructions.json through the same fetchUrlOf the
 * site and agents.md use. Run: npx vite-node scripts/readme-instructions.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { INSTRUCTIONS_GATEWAY } from "../src/config";
import { fetchUrlOf } from "../src/instructions";
import manifest from "../src/instructions.json";

function readmeInstructions(): string {
  return (["rebuild", "changes"] as const)
    .map((k) => `- ${k}: \`${fetchUrlOf(manifest[k].file, manifest[k].sha256, INSTRUCTIONS_GATEWAY)}\`,\n  sha256 \`${manifest[k].sha256}\``)
    .join("\n");
}

const START = "<!-- instructions:start -->";
const END = "<!-- instructions:end -->";
{
  const readme = readFileSync("README.md", "utf8");
  const a = readme.indexOf(START);
  const b = readme.indexOf(END);
  if (a < 0 || b < a) throw new Error("README.md has no instructions markers");
  writeFileSync("README.md", `${readme.slice(0, a + START.length)}\n${readmeInstructions()}\n${readme.slice(b)}`);
}
