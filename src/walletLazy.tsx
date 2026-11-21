/**
 * Privacy: no wallet library code is loaded, and no third party is contacted, until the visitor presses Connect.
 * Until then the Connect button is a plain button; pressing it imports walletRuntime.tsx (wagmi, the EIP-6963
 * injected connector and Coinbase Smart Wallet with telemetry off) and opens the connect sheet.
 */
import { useState, useSyncExternalStore } from "react";
import type { WalletAccount } from "./walletRuntime";

type Runtime = typeof import("./walletRuntime");
let runtime: Runtime | null = null;
let loading: Promise<Runtime> | null = null;
const NONE: WalletAccount = { address: undefined, isConnected: false, chainId: undefined };
let account: WalletAccount = NONE;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** Loads the wallet runtime once; later calls get the same module. */
export function loadWallet(): Promise<Runtime> {
  loading ??= import("./walletRuntime").then((m) => {
    runtime = m;
    m.watch((a) => {
      if (a.address !== account.address || a.isConnected !== account.isConnected || a.chainId !== account.chainId) account = a;
      emit();
    });
    emit();
    return m;
  });
  return loading;
}

export const isWalletLoaded = () => runtime !== null;
export const useWalletRuntime = () => useSyncExternalStore(subscribe, () => runtime);
/** The connected account; empty until the wallet runtime has loaded. */
export const useWalletAccount = () => useSyncExternalStore(subscribe, () => account);

/** Connect: a plain button until pressed; then the wallet runtime's connect control, with its sheet open. */
export function Connect() {
  const rt = useWalletRuntime();
  const [auto, setAuto] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  if (rt) return <rt.Connect autoOpen={auto} />;
  const press = async () => {
    setBusy(true);
    setFailed(false);
    try {
      const m = await loadWallet();
      const connected = await m.tryReconnect();
      setAuto(!connected);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <button type="button" className="btn btn-primary" onClick={() => void press()} disabled={busy} aria-haspopup="dialog">
        {busy ? "Opening…" : "Connect"}
      </button>
      {failed && (
        <span className="small" role="status">
          The wallet code did not load. Try again.
        </span>
      )}
    </>
  );
}
