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
 * Every key a wallet library may have written in this site's storage: wagmi (wagmi.store held each connection with its
 * accounts, wagmi.recentConnectorId, wagmi.injected.connected), the Coinbase Wallet SDK (-CBWSDK:…, cbwsdk.store,
 * -walletlink:…, which held the address) and WalletConnect (wc@2:…, WCM_…, @w3m/…). The site's own flag never matches.
 */
export const WALLET_KEY = /^(?:wagmi\.|-CBWSDK:|cbwsdk\.|-walletlink|walletlink|wc@2:|WCM_|@w3m|@appkit|WALLETCONNECT|walletconnect)/i;

/**
 * Removes every wallet library key (WALLET_KEY) from localStorage and sessionStorage. Run on every page load and on
 * Disconnect; the site's own flag is kept (Disconnect clears it with forgetWallet).
 */
export const dropWalletSnapshots = (): number => {
  let n = 0;
  for (const s of [store(), session()]) {
    if (!s) continue;
    try {
      const keys: string[] = [];
      for (let i = 0; i < s.length; i++) {
        const k = s.key(i);
        if (k && WALLET_KEY.test(k)) keys.push(k);
      }
      for (const k of keys) s.removeItem(k);
      n += keys.length;
    } catch {
      /* storage blocked */
    }
  }
  return n;
};

const session = (): Storage | null => {
  try {
    return typeof sessionStorage === "undefined" ? null : sessionStorage;
  } catch {
    return null;
  }
};
