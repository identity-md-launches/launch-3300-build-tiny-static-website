/** Wallets, the network's one way: EIP-6963 extensions, "Open in" links on phones, Coinbase Smart Wallet. No relay, no project ID. */
import { useEffect, useRef, useState } from "react";
import { createConfig, http, useAccount, useConnect, useDisconnect, useEnsName, useSwitchChain, type Connector } from "wagmi";
import { coinbaseWallet, injected } from "wagmi/connectors";
import { CHAIN, CHAIN_ID, RPCS, SITE_NAME } from "./config";
import { WALLET_ICONS } from "./wallet-icons";
import { holdFocus } from "./modal";
import { forgetWallet } from "./walletFlag";

/**
 * The browser's own injected wallet (window.ethereum), as a targeted connector: it is authorized by asking the
 * wallet (eth_accounts), not by a flag wagmi would keep in storage. Same id and name as wagmi's plain injected().
 */
const browserWallet = injected({
  target: () => ({ id: "injected", name: "Injected", provider: ((w?: unknown) => (w as { ethereum?: unknown } | undefined)?.ethereum) as never }),
});

export const config = createConfig({
  chains: [CHAIN],
  // EIP-6963 discovery lists every installed extension under its own name
  multiInjectedProviderDiscovery: true,
  // Coinbase Smart Wallet with its telemetry off: the SDK sends no analytics (cca-lite.coinbase.com).
  connectors: [browserWallet, coinbaseWallet({ appName: SITE_NAME, preference: { options: "all", telemetry: false } })],
  // Nothing about the wallet is persisted by wagmi (its default keeps connections, with their addresses, in
  // localStorage under wagmi.store). The site remembers a connection with its one flag (walletFlag.ts) and a silent
  // reconnect asks the already-authorized wallet for the account. Without storage, mounting WagmiProvider with
  // reconnectOnMount={false} also leaves a connection made just before it in place.
  storage: null,
  transports: { [CHAIN.id]: http(RPCS[0]!.url) },
});

/** Each link opens this page inside a wallet's own browser, where the wallet is injected. */
export const OPEN_IN: ReadonlyArray<{ id: string; name: string; href: (url: string) => string }> = [
  // https://docs.metamask.io/metamask-connect/evm/guides/metamask-exclusive/use-deeplinks
  { id: "metamask", name: "MetaMask", href: (url) => `https://link.metamask.io/dapp/${url.replace(/^https?:\/\//, "")}` },
  // https://docs.cdp.coinbase.com/wallet-sdk/docs/deep-link
  { id: "coinbase", name: "Coinbase Wallet", href: (url) => `https://go.cb-w.com/dapp?cb_url=${encodeURIComponent(url)}` },
  // Rabby publishes no documented link: the row opens Rabby's own page, the reference's stated fallback.
  { id: "rabby", name: "Rabby", href: () => "https://rabby.io/" },
  // https://docs.phantom.com/phantom-deeplinks/other-methods/browse
  { id: "phantom", name: "Phantom", href: (url) => `https://phantom.app/ul/browse/${encodeURIComponent(url)}?ref=${encodeURIComponent(new URL(url).origin)}` },
];

export const isMobileBrowser = () =>
  /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) && !(window as unknown as { ethereum?: unknown }).ethereum;

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

/** The connect control and its sheet. */
export function ConnectSheet({ autoOpen = false }: { autoOpen?: boolean }) {
  const mobile = isMobileBrowser();
  const { address, isConnected, chainId } = useAccount();
  const { connectors, connect, isPending, variables, error, reset } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain, isPending: switching } = useSwitchChain();
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const sheet = useRef<HTMLDivElement>(null);

  const close = () => {
    setOpen(false);
    reset();
    trigger.current?.focus();
  };
  useEffect(() => {
    if (!open) return;
    // Everything outside the sheet is inert and Tab cycles inside it, also when it opens over the pay dialog.
    // Escape closes this sheet only (it is the top modal), leaving the pay dialog open behind it.
    const release = sheet.current ? holdFocus(sheet.current, close) : () => undefined;
    sheet.current?.querySelector<HTMLElement>("button, a")?.focus();
    return release;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  useEffect(() => {
    if (isConnected) setOpen(false);
  }, [isConnected]);
  // Opened by the visitor's press on the plain Connect button that loaded this code.
  useEffect(() => {
    if (autoOpen && !isConnected) setOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoOpen]);

  const named = connectors.some((c) => c.type === "injected" && c.id !== "injected");
  const listed = [...connectors.filter((c) => c.type === "injected"), ...connectors.filter((c) => c.type !== "injected")].filter(
    (c) => !(c.id === "injected" && named),
  );
  const label = (c: Connector) =>
    c.id === "injected" ? "Browser wallet" : c.id === "coinbaseWalletSDK" && mobile ? "Coinbase Smart Wallet" : c.name;
  const icon = (c: Connector) => c.icon ?? WALLET_ICONS[c.id];

  if (isConnected && address) {
    // Disconnect in the site's own menu forgets the wallet: the next visit shows Connect and loads no wallet code.
    const chip = (
      <AccountChip
        address={address}
        onDisconnect={() => {
          forgetWallet();
          disconnect();
        }}
      />
    );
    // On another chain the chip and its menu stay (who is connected, Copy address, Disconnect); Switch sits beside it.
    if (chainId !== CHAIN_ID)
      return (
        <div className="acct-wrap">
          <button className="btn btn-primary btn-switch" onClick={() => switchChain({ chainId: CHAIN_ID })} disabled={switching}>
            {switching ? "Switching…" : "Switch to Ethereum"}
          </button>
          {chip}
        </div>
      );
    return chip;
  }
  return (
    <>
      <button ref={trigger} className="btn btn-primary" onClick={() => setOpen(true)} aria-haspopup="dialog">
        Connect
      </button>
      {open && (
        <div className="sheet-bg" onClick={close}>
          <div ref={sheet} className="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-head">
              <h2 id="sheet-title">Connect a wallet</h2>
              <button className="x" aria-label="Close" onClick={close}>
                ×
              </button>
            </div>
            {mobile &&
              OPEN_IN.map((w) => (
                <a key={w.id} className="row" href={w.href(location.href)}>
                  <img className="ic" width={28} height={28} src={WALLET_ICONS[w.id]} alt="" />
                  <span>Open in {w.name}</span>
                </a>
              ))}
            {listed
              .filter((c) => !mobile || c.type !== "injected")
              .map((c) => (
                <button key={c.uid} className="row" onClick={() => connect({ connector: c, chainId: CHAIN_ID })} disabled={isPending}>
                  {icon(c) ? <img className="ic" width={28} height={28} src={icon(c)} alt="" /> : <span className="ic" aria-hidden="true" />}
                  <span>
                    {label(c)}
                    {isPending && variables?.connector === c ? " · opening…" : ""}
                  </span>
                </button>
              ))}
            <p className="note" role="status">
              {error ? "The wallet did not connect. Try again or pick another wallet." : ""}
            </p>
          </div>
        </div>
      )}
    </>
  );
}

/**
 * Connected: a chip with the ENS name or the short address, the Connect button's height. It opens a small menu
 * with Copy address and Disconnect. Escape or a click outside closes it; focus returns to the chip.
 */
export function AccountChip({ address, onDisconnect }: { address: `0x${string}`; onDisconnect: () => void }) {
  const { data: ens } = useEnsName({ address, chainId: CHAIN_ID });
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const chip = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      chip.current?.focus();
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    box.current?.querySelector<HTMLElement>(".acct-menu button")?.focus();
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  const copy = () => {
    void navigator.clipboard?.writeText(address).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <div className="acct" ref={box} onBlur={(e) => open && !box.current?.contains(e.relatedTarget as Node) && setOpen(false)}>
      <button ref={chip} type="button" className="acct-chip" aria-expanded={open} aria-controls="acct-menu" title={address} onClick={() => setOpen((v) => !v)}>
        <span className="acct-dot" aria-hidden="true" />
        <span className={ens ? "acct-name" : "acct-name mono"}>{ens ?? short(address)}</span>
        <span className="acct-chev" aria-hidden="true" />
      </button>
      {open && (
        <div className="acct-menu" id="acct-menu">
          <button type="button" onClick={copy}>
            {copied ? "Copied" : "Copy address"}
          </button>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onDisconnect();
            }}
          >
            Disconnect
          </button>
        </div>
      )}
    </div>
  );
}
