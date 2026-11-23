/**
 * Reads from the public RPC without any wallet library: prices, allowances, balances and ENS names. The wallet
 * code (wagmi and its connectors) loads only when the visitor presses Connect (see walletLazy.tsx).
 */
import { createPublicClient, http } from "viem";
import { CHAIN, RPCS } from "./config";

// ccipRead: false: an ENS resolver that answers with an off-chain lookup (EIP-3668) is not followed to its gateway.
// Names are read only through the site's public RPC; such a name is not shown.
export const publicClient = createPublicClient({ chain: CHAIN, transport: http(RPCS[0]!.url), ccipRead: false });
