import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import tailwindcss from "@tailwindcss/vite";

// Where the dev server proxies /api to. Override with VITE_API_TARGET, e.g.
//   VITE_API_TARGET=https://magi.tailb93ac8.ts.net bun run dev
// to develop the UI against magi's canonical Lific instance from any machine
// on the tailnet. Defaults to a local lific binary on 127.0.0.1:3456.
const API_TARGET = process.env.VITE_API_TARGET ?? "http://127.0.0.1:3456";
const PROXY_SECURE = process.env.VITE_API_INSECURE !== "1";

export default defineConfig({
  plugins: [tailwindcss(), svelte()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  server: {
    // Bind on all interfaces so other machines on the tailnet (e.g. unit-03)
    // can reach the dev server running on unit-02. Without this vite only
    // listens on 127.0.0.1.
    host: true,
    // If 5173 is taken, fail fast instead of switching ports (avoids "module load failed"
    // when the browser tab still points at the old URL).
    port: 5173,
    strictPort: true,
    proxy: {
      "/api": {
        target: API_TARGET,
        changeOrigin: true,
        secure: PROXY_SECURE,
      },
    },
  },
});
