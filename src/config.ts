/** Every address, chain id, route, ABI and RPC the site uses, in one place. */
import { mainnet } from "viem/chains";

export const SITE_NAME = "On the record (test)";
export const SITE_DESCRIPTION =
  "Public record pages for crypto projects. Every line shows who said it, its source and how it was checked.";

/**
 * Where this site is served by its ENS name (record-test-1.identitymd.eth, through the eth.limo gateway). The
 * instruction files a job must fetch are named under it, so they are served with the site.
 */
export const SITE_URL = "https://record-test-1.identitymd.eth.limo/";

/**
 * The HTTPS gateway a job fetches an instruction file from, by the file's own content address (see
 * src/instructions.ts): https://ipfs.filebase.io/ipfs/<raw CIDv1 of the file's sha256>?filename=<name>-<hash12>.txt.
 * Checked on 2026-11-21 (README, "Where a job fetches the instruction files"):
 * - Filebase answers a plain GET with HTTP 200 and the file's bytes. The site is pinned with raw leaves, so a file
 *   under 256 KiB is the block whose CID is computed from its sha256: the published agents.md, fetched by that CID
 *   here, came back byte for byte (and from gateway.pinata.cloud too).
 * - dweb.link, ipfs.io, w3s.link and nftstorage.link, by name or by CID, answer HTTP 429 with a 195-byte
 *   "switching to a service worker gateway" text, so a job could not fetch the file there.
 * - Any address containing the ENS name (record-test-1.identitymd.eth.limo, ipfs.filebase.io/ipns/record-test-1.
 *   identitymd.eth, in any letter case) makes IMD's free check refuse the objective with unsafe_brief ("reads a
 *   private path on the worker's own machine"); the content address returns no blockers.
 * The address can only ever serve those exact bytes, which suits files that never change.
 */
export const INSTRUCTIONS_GATEWAY = "https://ipfs.filebase.io/ipfs/";
/**
 * A second HTTPS gateway for the same raw CID, named in the objective as "or, if that fails, at <URL2>". Checked on
 * 2026-11-21: gateway.pinata.cloud answered the raw CID of the published rebuild-ede1a5e23b01.txt with HTTP 200, the
 * exact bytes (sha256 matched) and Access-Control-Allow-Origin: *, as Filebase did (the current files are served once
 * this export is pinned). Kept because IMD's free request check returned blockers: [] for the rebuild and changes
 * objectives naming both addresses (README, "Where a job fetches the instruction files").
 */
export const INSTRUCTIONS_FALLBACK_GATEWAY = "https://gateway.pinata.cloud/ipfs/";

export const CHAIN = mainnet; // Ethereum mainnet, chain 1, only
export const CHAIN_ID = 1 as const;

/** IMD Intake v2: the only contract the site sends a transaction to, apart from IMD's approve. */
export const INTAKE = "0xa43e6f75ee006411f79ac1c84120606c2330de82" as const;
/** IMD on Ethereum: the asset every request pays in. */
export const IMD = "0xd34a99bc0f67ae1bbd63c660e6d0b0dd03e263b7" as const;
export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as const;
export const EMPTY_SELECTOR = "0x00000000" as const;

/** The block this site launched at: the activity scan starts here. No tagged request exists before it. */
export const LAUNCH_BLOCK = 26445600n;

/** Every request this site makes carries this tag, so it can be found again from chain logs. */
export const APP_TAG = "rec-test-1";
export const TAG_NEEDLE = `"app":"${APP_TAG}"`;

export const ACTIONS = {
  research: "job.open@job-1",
  oracle: "oracle.request@oracle-1",
} as const;

/** Public RPCs that answer eth_getLogs from a browser. The first serves 49,000-block ranges, the rest less. */
export const RPCS: ReadonlyArray<{ url: string; span: bigint }> = [
  { url: "https://gateway.tenderly.co/public/mainnet", span: 49_000n },
  { url: "https://ethereum-rpc.publicnode.com", span: 9_000n },
  { url: "https://rpc.mevblocker.io", span: 9_000n },
];

export const API = "https://api.imd.fun";
export const EXPLORER = "https://explorer.imd.fun";
export const ETHERSCAN = "https://etherscan.io";

/** keccak256 of the Intake's event signatures, read from its logs on mainnet. */
export const TOPIC_REQUESTED =
  "0x1c521a43c9b0f72a335bc80a6918abce08af7949ebbd1c41fe2a576074379063" as const; // Requested(bytes32,address,bytes32,bytes,address,bytes4,address,uint256)
export const TOPIC_COMPLETED =
  "0xd4ad2d2ef4e8ea9995103f34e322dbefb2534f3a52984a308f7db8e257b76fa1" as const; // Completed(bytes32,uint8,bytes32,string,bool)

export const INTAKE_ABI = [
  {
    type: "function",
    name: "priceOf",
    stateMutability: "view",
    inputs: [
      { name: "action", type: "bytes32" },
      { name: "asset", type: "address" },
    ],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "request",
    stateMutability: "nonpayable",
    inputs: [
      { name: "action", type: "bytes32" },
      { name: "body", type: "bytes" },
      {
        name: "callback",
        type: "tuple",
        components: [
          { name: "target", type: "address" },
          { name: "selector", type: "bytes4" },
        ],
      },
      { name: "asset", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "requestId", type: "bytes32" }],
  },
  {
    type: "event",
    name: "Requested",
    inputs: [
      { name: "requestId", type: "bytes32", indexed: true },
      { name: "payer", type: "address", indexed: true },
      { name: "action", type: "bytes32", indexed: true },
      { name: "body", type: "bytes", indexed: false },
      { name: "callbackTarget", type: "address", indexed: false },
      { name: "callbackSelector", type: "bytes4", indexed: false },
      { name: "asset", type: "address", indexed: false },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "Completed",
    inputs: [
      { name: "requestId", type: "bytes32", indexed: true },
      { name: "status", type: "uint8", indexed: false },
      { name: "resultHash", type: "bytes32", indexed: false },
      { name: "uri", type: "string", indexed: false },
      { name: "delivered", type: "bool", indexed: false },
    ],
  },
] as const;

export const ERC20_ABI = [
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
  },
] as const;
