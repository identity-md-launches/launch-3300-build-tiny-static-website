/**
 * Privacy: no wallet library code is loaded, and no third party is contacted, until the visitor presses Connect.
 * Until then the Connect button is a plain button; pressing it imports walletRuntime.tsx (wagmi, the EIP-6963
 * injected connector and Coinbase Smart Wallet with telemetry off) and opens the connect sheet.
 *
 * Staying connected: when a wallet connects, one flag is kept in the browser (walletFlag.ts, no address). On the next
 * page load, restoreWallet() sees the flag, loads the same wallet code in the background and reconnects silently, so
 * the address chip appears without a click. While that runs the header shows the chip's outline in place of Connect;
 * if it fails, Connect shows and the flag is cleared. Without the flag nothing is loaded until Connect is pressed.
 */
import { useState, useSyncExternalStore } from "react";
import type { WalletAccount } from "./walletRuntime";
import { forgetWallet, hasWalletFlag, rememberWallet } from "./walletFlag";

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
      // A connected wallet is remembered for the next visit (the flag only; Disconnect in our menu clears it).
      if (a.isConnected) rememberWallet();
      if (a.address !== account.address || a.isConnected !== account.isConnected || a.chainId !== account.chainId) account = a;
      emit();
    });
    emit();
    return m;
  });
  return loading;
}

export const isWalletLoaded = () => runtime !== null;

/** True while a silent reconnect from the flag is running: the header shows the chip's outline. */
let restoring = false;
let restoreRun: Promise<boolean> | null = null;
export const useWalletRestoring = () => useSyncExternalStore(subscribe, () => restoring, () => false);
/**
 * On page load: with the flag set, loads the wallet code in the background and reconnects silently. Resolves true
 * when a wallet is connected afterwards. Without the flag it loads nothing and resolves false at once.
 */
export function restoreWallet(load: () => Promise<Pick<Runtime, "tryReconnect">> = loadWallet): Promise<boolean> {
  if (restoreRun) return restoreRun;
  if (!hasWalletFlag()) return Promise.resolve(false);
  restoring = true;
  emit();
  restoreRun = load()
    .then((m) => m.tryReconnect())
    .catch(() => false)
    .then((ok) => {
      if (!ok) forgetWallet();
      restoring = false;
      emit();
      return ok;
    });
  return restoreRun;
}

/** The chip's outline, the Connect button's size, while a remembered wallet reconnects; it says so to screen readers. */
export function ChipOutline() {
  return (
    <span className="acct-chip acct-chip-ghost" role="status" aria-live="polite">
      <span className="acct-dot" aria-hidden="true" />
      <span className="acct-ghost-bar" aria-hidden="true" />
      <span className="sr-only">Reconnecting your wallet…</span>
    </span>
  );
}
export const useWalletRuntime = () => useSyncExternalStore(subscribe, () => runtime);
/** The connected account; empty until the wallet runtime has loaded. */
export const useWalletAccount = () => useSyncExternalStore(subscribe, () => account);

/** Connect: a plain button until pressed; then the wallet runtime's connect control, with its sheet open. */
export function Connect() {
  const rt = useWalletRuntime();
  const restoringNow = useWalletRestoring();
  const [auto, setAuto] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  if (restoringNow) return <ChipOutline />;
  if (rt) return <rt.Connect autoOpen={auto} />;
  const press = async () => {
    setBusy(true);
    setFailed(false);
    try {
      // A press with no flag set opens the sheet: the visitor picks the wallet (wagmi keeps no "disconnected" note,
      // so a silent reconnect here could bring back a wallet they disconnected from our menu).
      await loadWallet();
      setAuto(true);
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
