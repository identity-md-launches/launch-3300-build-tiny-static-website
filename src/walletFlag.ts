/**
 * One flag in the browser saying this visitor connected a wallet here: set when a wallet connects, cleared when they
 * press Disconnect in the site's own menu or a silent reconnect fails. It holds no address. No dependencies, so the
 * first page load can read it without loading any wallet code.
 */
export const WALLET_FLAG = "imd-record:wallet-connected";

const store = (): Storage | null => {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null; // storage blocked (private mode, a sandboxed frame)
  }
};

export const hasWalletFlag = (): boolean => store()?.getItem(WALLET_FLAG) === "1";
export const rememberWallet = (): void => {
  try {
    store()?.setItem(WALLET_FLAG, "1");
  } catch {
    /* storage full or blocked: the next visit shows Connect */
  }
};
export const forgetWallet = (): void => {
  try {
    store()?.removeItem(WALLET_FLAG);
  } catch {
    /* nothing to clear */
  }
};

/**
 * Removes what wagmi persisted before the site stopped letting it (wagmi.store held each connection with its
 * accounts, plus wagmi.recentConnectorId, wagmi.injected.connected and the like). Run once on every page load; the
 * site's own flag is kept.
 */
export const dropWalletSnapshots = (): number => {
  const s = store();
  if (!s) return 0;
  try {
    const keys: string[] = [];
    for (let i = 0; i < s.length; i++) {
      const k = s.key(i);
      if (k && /^wagmi\./.test(k)) keys.push(k);
    }
    for (const k of keys) s.removeItem(k);
    return keys.length;
  } catch {
    return 0;
  }
};
