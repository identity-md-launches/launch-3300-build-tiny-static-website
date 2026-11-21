/**
 * The wallet runtime, loaded by walletLazy.tsx only after the visitor presses Connect: wagmi, its connectors and
 * the connect sheet. Nothing here is part of the first page load.
 */
import { WagmiProvider } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getAccount, reconnect, waitForTransactionReceipt, watchAccount, writeContract } from "wagmi/actions";
import { config, ConnectSheet } from "./wallet";

const queryClient = new QueryClient();

export type WalletAccount = { address: `0x${string}` | undefined; isConnected: boolean; chainId: number | undefined };

/** The connect control inside its own providers; several share one config and so one connection. */
export function Connect({ autoOpen = false }: { autoOpen?: boolean }) {
  return (
    <WagmiProvider config={config} reconnectOnMount={false}>
      <QueryClientProvider client={queryClient}>
        <ConnectSheet autoOpen={autoOpen} />
      </QueryClientProvider>
    </WagmiProvider>
  );
}

const snap = (): WalletAccount => {
  const a = getAccount(config);
  return { address: a.address, isConnected: a.isConnected, chainId: a.chainId };
};

/** Calls back with the account now and on every change. */
export function watch(cb: (a: WalletAccount) => void): () => void {
  cb(snap());
  return watchAccount(config, { onChange: () => cb(snap()) });
}

/** Reconnects a wallet this site was already allowed to use; true when one is connected afterwards. */
export async function tryReconnect(): Promise<boolean> {
  try {
    await reconnect(config);
  } catch {
    /* no earlier connection */
  }
  return getAccount(config).isConnected;
}

/** Sends one contract call from the connected wallet on chain 1 (approve, or the Intake's request). */
export const write = (args: { address: `0x${string}`; abi: readonly unknown[]; functionName: string; args: readonly unknown[]; chainId: number }) =>
  (writeContract as unknown as (c: typeof config, a: unknown) => Promise<`0x${string}`>)(config, { ...args, chainId: 1 });
export const waitFor = (hash: `0x${string}`, _chainId?: number) => waitForTransactionReceipt(config, { hash, chainId: 1 });
