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
