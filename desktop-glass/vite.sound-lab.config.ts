/**
 * Standalone dev server for sound-prototype.html (browser only, no Electron).
 */
import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  root: resolve(__dirname),
  server: {
    port: 5174,
    strictPort: false,
    open: "/sound-prototype.html",
  },
  build: {
    outDir: "out/sound-lab",
    emptyOutDir: true,
    rollupOptions: {
      input: resolve(__dirname, "sound-prototype.html"),
    },
  },
});
