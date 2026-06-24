import { resolve } from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/**
 * Plain-Vite renderer config for the standalone "IIVO Terminal" app.
 *
 * This builds ONLY the renderer bundle. The main and preload bundles are
 * produced by electron-vite (see electron-vite.standalone.config.ts and the
 * `dev:terminal` / `build:terminal` npm scripts), which is the toolchain the
 * rest of this repo uses. Kept here for renderer-only iteration / parity with
 * the requested layout.
 */
export default defineConfig({
  root: resolve(__dirname, "src/renderer/terminal-standalone"),
  base: "./",
  plugins: [react()],
  server: {
    port: 5174,
    strictPort: false,
    hmr: { overlay: false },
  },
  optimizeDeps: {
    include: ["lucide-react"],
  },
  build: {
    outDir: resolve(__dirname, "dist-standalone/renderer"),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: resolve(__dirname, "src/renderer/terminal-standalone/index.html"),
      },
    },
  },
});
