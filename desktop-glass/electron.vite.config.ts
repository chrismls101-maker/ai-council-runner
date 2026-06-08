import { resolve } from "node:path";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";
import { loadEnv } from "vite";

/** Baked into the main bundle at build time for packaged DMG auth (see iivoApiAuth.ts). */
function resolveBuildGlassApiSecret(): string {
  const fromShell = process.env.IIVO_GLASS_API_SECRET?.trim();
  if (fromShell) return fromShell;
  const fromRootEnv = loadEnv(
    process.env.NODE_ENV === "production" ? "production" : "development",
    resolve(__dirname, ".."),
    "",
  ).IIVO_GLASS_API_SECRET?.trim();
  return fromRootEnv || "";
}

const bakedGlassApiSecret = resolveBuildGlassApiSecret();

export default defineConfig({
  main: {
    define: {
      "process.env.IIVO_GLASS_API_SECRET": JSON.stringify(bakedGlassApiSecret),
    },
    plugins: [externalizeDepsPlugin()],
    build: {
      lib: {
        entry: resolve(__dirname, "src/main/index.ts"),
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      lib: {
        entry: resolve(__dirname, "src/preload/index.ts"),
      },
    },
  },
  renderer: {
    root: __dirname,
    base: "./",
    plugins: [react()],
    server: {
      // Vite's full-screen error overlay blocks Glass click-through windows in dev.
      hmr: { overlay: false },
    },
    optimizeDeps: {
      include: ["lucide-react"],
    },
    build: {
      outDir: "out/renderer",
      rollupOptions: {
        input: {
          dock: resolve(__dirname, "index.html"),
          panel: resolve(__dirname, "panel.html"),
          overlay: resolve(__dirname, "overlay.html"),
          command: resolve(__dirname, "command.html"),
          splash: resolve(__dirname, "splash.html"),
          notes: resolve(__dirname, "notes.html"),
        },
      },
    },
  },
});
