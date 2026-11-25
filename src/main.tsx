import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";
import { restoreWallet } from "./walletLazy";
import { dropWalletSnapshots } from "./walletFlag";

// Wallet snapshots an earlier version let wagmi keep (with the address) are removed; only the one flag stays.
dropWalletSnapshots();

// A heading that takes focus when a page opens shows its outline only to a visitor who got there with the keyboard.
const html = document.documentElement;
window.addEventListener("keydown", (e) => {
  if (e.key === "Tab" || e.key === "Enter" || e.key === " " || e.key.startsWith("Arrow") || e.key === "Escape") html.classList.add("kbd");
}, true);
window.addEventListener("pointerdown", () => html.classList.remove("kbd"), true);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// A wallet connected on an earlier visit reconnects silently in the background (only when its flag is set).
void restoreWallet();
