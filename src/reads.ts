/**
 * Reads from the public RPC without any wallet library: prices, allowances, balances and ENS names. The wallet
 * code (wagmi and its connectors) loads only when the visitor presses Connect (see walletLazy.tsx).
 */
import { createPublicClient, http } from "viem";
import { CHAIN, RPCS } from "./config";

export const publicClient = createPublicClient({ chain: CHAIN, transport: http(RPCS[0]!.url) });
