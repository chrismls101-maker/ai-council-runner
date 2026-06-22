import { resolve } from "node:path";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";

/**
 * electron-vite config for the standalone "IIVO Terminal" app.
 *
 * Mirrors electron.vite.config.ts but:
 *   - main entry  → src/main/terminalStandalone.ts
 *   - renderer    → single entry src/renderer/terminal-standalone/index.html
 *   - output      → dist-standalone/{main,preload,renderer}
 *   - dev port    → 5174 (avoids clashing with the Glass dev server on 5173)
 *
 * The preload bundle is shared verbatim with Glass — same window.glass bridge.
 */
export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: "dist-standalone/main",
      lib: {
        entry: resolve(__dirname, "src/main/terminalStandalone.ts"),
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: "dist-standalone/preload",
      lib: {
        entry: resolve(__dirname, "src/preload/index.ts"),
      },
    },
  },
  renderer: {
    root: resolve(__dirname, "src/renderer/terminal-standalone"),
    base: "./",
    plugins: [react()],
    server: {
      port: 5174,
      strictPort: true,
      hmr: { overlay: false },
    },
    optimizeDeps: {
      include: ["lucide-react"],
    },
    build: {
      outDir: resolve(__dirname, "dist-standalone/renderer"),
      rollupOptions: {
        input: {
          index: resolve(__dirname, "src/renderer/terminal-standalone/index.html"),
        },
      },
    },
  },
});
