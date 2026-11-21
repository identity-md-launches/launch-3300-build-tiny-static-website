import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";
import { restoreWallet } from "./walletLazy";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// A wallet connected on an earlier visit reconnects silently in the background (only when its flag is set).
void restoreWallet();
