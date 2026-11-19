import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Relative asset URLs, so the export works under an IPFS gateway subpath or an ENS name.
export default defineConfig({
  base: "./",
  plugins: [react()],
  build: { outDir: "dist", assetsDir: "assets", sourcemap: false, chunkSizeWarningLimit: 2000 },
});
