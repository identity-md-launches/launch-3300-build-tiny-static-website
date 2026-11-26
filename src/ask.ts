/**
 * "Ask the contract": one eth_call from the visitor's browser, on a public RPC for the chain the page names, with no
 * wallet. The answer is decoded by the page's return type and compared with the value the proof line recorded.
 * Pure helpers (rpcFor, decodeAnswer, sameValue) are exported for tests.
 */
import { decodeAbiParameters, formatUnits } from "viem";
import type { AskCall, Fact } from "./page";

/** Public RPCs that answer eth_call from a browser without a key, by chain id. */
export const ASK_RPCS: Record<number, string[]> = {
  1: ["https://ethereum-rpc.publicnode.com", "https://eth.llamarpc.com"],
  8453: ["https://mainnet.base.org", "https://base-rpc.publicnode.com"],
  10: ["https://mainnet.optimism.io", "https://optimism-rpc.publicnode.com"],
  42161: ["https://arb1.arbitrum.io/rpc", "https://arbitrum-one-rpc.publicnode.com"],
  137: ["https://polygon-rpc.com", "https://polygon-bor-rpc.publicnode.com"],
  7777777: ["https://rpc.zora.energy"],
  130: ["https://mainnet.unichain.org"],
  56: ["https://bsc-rpc.publicnode.com"],
  43114: ["https://api.avax.network/ext/bc/C/rpc"],
  100: ["https://rpc.gnosischain.com"],
  59144: ["https://rpc.linea.build"],
  534352: ["https://rpc.scroll.io"],
  324: ["https://mainnet.era.zksync.io"],
  81457: ["https://rpc.blast.io"],
  11155111: ["https://ethereum-sepolia-rpc.publicnode.com"],
  84532: ["https://sepolia.base.org"],
  42170: ["https://nova.arbitrum.io/rpc", "https://arbitrum-nova-rpc.publicnode.com"],
  250: ["https://fantom-rpc.publicnode.com"],
  5000: ["https://rpc.mantle.xyz", "https://mantle-rpc.publicnode.com"],
  34443: ["https://mainnet.mode.network"],
  42220: ["https://forno.celo.org", "https://celo-rpc.publicnode.com"],
  1284: ["https://rpc.api.moonbeam.network", "https://moonbeam-rpc.publicnode.com"],
  25: ["https://evm.cronos.org"],
  146: ["https://rpc.soniclabs.com", "https://sonic-rpc.publicnode.com"],
  80094: ["https://rpc.berachain.com", "https://berachain-rpc.publicnode.com"],
  1868: ["https://rpc.soneium.org"],
  57073: ["https://rpc-gel.inkonchain.com"],
  480: ["https://worldchain-mainnet.g.alchemy.com/public"],
  252: ["https://rpc.frax.com"],
  1101: ["https://zkevm-rpc.com"],
  17000: ["https://ethereum-holesky-rpc.publicnode.com"],
  11155420: ["https://sepolia.optimism.io"],
  421614: ["https://sepolia-rollup.arbitrum.io/rpc"],
};

export const rpcFor = (chainId: number): string[] => ASK_RPCS[chainId] ?? [];

export interface AskAnswer {
  /** The decoded value as shown: a decimal number in whole units, an address, true/false or the text. */
  value: string;
  block: bigint;
  /** The block's own time, in milliseconds. */
  time: number;
}

/** Decodes one return value of the given type; a uint is shown in whole units when decimals are given. */
export function decodeAnswer(hex: string, call: Pick<AskCall, "returns" | "decimals">): string {
  if (!/^0x[0-9a-fA-F]*$/.test(hex) || hex.length < 3) throw new Error("The contract returned no value");
  const data = hex as `0x${string}`;
  if (call.returns === "uint") {
    const [v] = decodeAbiParameters([{ type: "uint256" }], data);
    return call.decimals ? formatUnits(v, call.decimals) : v.toString();
  }
  if (call.returns === "address") return String(decodeAbiParameters([{ type: "address" }], data)[0]);
  if (call.returns === "bool") return decodeAbiParameters([{ type: "bool" }], data)[0] ? "true" : "false";
  return String(decodeAbiParameters([{ type: "string" }], data)[0]);
}

/** A number as digits only ("1,234.50 USDC" → "1234.5"), or null when the text holds no single number. */
const numberOf = (s: string): string | null => {
  const m = /^[^\d-]*(-?[\d,]*\.?\d+)\s*[^\d]*$/.exec(s.trim());
  if (!m) return null;
  const n = m[1]!.replace(/,/g, "");
  const [i, f = ""] = n.split(".");
  const fr = f.replace(/0+$/, "");
  return `${(i ?? "").replace(/^(-?)0+(?=\d)/, "$1")}${fr ? `.${fr}` : ""}`;
};

/**
 * Whether the answer equals the value the page recorded, by the call's return type: a string by its exact text (case
 * counts), an address by its hex, a bool as true/false, a uint by its digits (separators, trailing zeros and the unit
 * ignored). With no type known, a number by its digits and anything else by its exact text. Null when nothing was
 * recorded.
 */
export function sameValue(answer: string, recorded: string | undefined | null, returns?: AskCall["returns"]): boolean | null {
  const r = (recorded ?? "").trim();
  if (!r) return null;
  if (returns === "string") return answer.trim() === r;
  if (returns === "bool") return answer === (/^(true|yes|1)$/i.test(r) ? "true" : /^(false|no|0)$/i.test(r) ? "false" : r);
  if (returns === "address" || /^0x[0-9a-fA-F]{40}$/.test(answer)) {
    const a = /0x[0-9a-fA-F]{40}/.exec(r)?.[0];
    return a ? a.toLowerCase() === answer.toLowerCase() : false;
  }
  const na = numberOf(answer);
  const nr = numberOf(r);
  if (na !== null && nr !== null) return na === nr;
  return answer.trim() === r;
}

/** The recorded value as the page shows it: the proof line's fact value and unit. */
export const recordedOf = (fact: Pick<Fact, "value" | "unit"> | null | undefined): string => (fact?.value ? `${fact.value}${fact.unit && !fact.value.includes(fact.unit) ? ` ${fact.unit}` : ""}` : "");

async function rpc(url: string, method: string, params: unknown[], signal?: AbortSignal): Promise<unknown> {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }), signal });
  if (!res.ok) throw new Error(`The RPC answered ${res.status}`);
  const j = (await res.json()) as { result?: unknown; error?: { message?: string } };
  if (j.error) throw new Error(j.error.message || "The RPC returned an error");
  return j.result;
}

/** Reads the latest block, then makes the call at that block. Tries each public RPC of the chain in turn. */
export async function askContract(call: AskCall, signal?: AbortSignal): Promise<AskAnswer> {
  const urls = rpcFor(call.chainId);
  if (!urls.length) throw new Error(`No public RPC is known for chain ${call.chainId}`);
  let last: unknown = null;
  for (const url of urls) {
    try {
      const b = (await rpc(url, "eth_getBlockByNumber", ["latest", false], signal)) as { number?: string; timestamp?: string } | null;
      if (!b?.number) throw new Error("The RPC gave no latest block");
      const out = (await rpc(url, "eth_call", [{ to: call.to, data: call.data }, b.number], signal)) as string;
      return { value: decodeAnswer(out, call), block: BigInt(b.number), time: Number(BigInt(b.timestamp ?? "0x0")) * 1000 };
    } catch (e) {
      if (signal?.aborted) throw e;
      last = e;
    }
  }
  throw last instanceof Error ? last : new Error("The call failed");
}
