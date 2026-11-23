/**
 * These suites predate the job gate (src/counts.ts). They build activities with placeholder objectives ("Research the
 * project.") to test what the model does with results it reads, so they count every result they hand in. The gate
 * itself is tested against the site's real bodies in tests/counts.test.ts.
 */
import { vi } from "vitest";

vi.mock("../src/counts", async (orig) => {
  const real = await orig<typeof import("../src/counts")>();
  return {
    ...real,
    countedOf: (items: { req: { requestId: string } }[]) => ({ counted: new Set(items.map((a) => a.req.requestId)), reasons: new Map<string, string>() }),
    shapeOf: () => ({ ok: true, kind: "add", priorHashes: [], channels: [], named: true }),
  };
});
