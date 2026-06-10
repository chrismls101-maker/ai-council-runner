import { resolve } from "node:path";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";
import { loadEnv } from "vite";

const envMode = process.env.NODE_ENV === "production" ? "production" : "development";
const repoRootEnv = loadEnv(envMode, resolve(__dirname, ".."), "");

/** Baked into the main bundle at build time for packaged DMG auth (see iivoApiAuth.ts). */
function resolveBuildGlassApiSecret(): string {
  const fromShell = process.env.IIVO_GLASS_API_SECRET?.trim();
  if (fromShell) return fromShell;
  return repoRootEnv.IIVO_GLASS_API_SECRET?.trim() || "";
}

/** Baked at build time so packaged Glass can report crashes without a local .env. */
function resolveBuildSentryDsn(): string {
  const fromShell = process.env.SENTRY_DSN?.trim();
  if (fromShell) return fromShell;
  return repoRootEnv.SENTRY_DSN?.trim() || "";
}

const bakedGlassApiSecret = resolveBuildGlassApiSecret();
const bakedSentryDsn = resolveBuildSentryDsn();

export default defineConfig({
  main: {
    define: {
      "process.env.IIVO_GLASS_API_SECRET": JSON.stringify(bakedGlassApiSecret),
      "process.env.SENTRY_DSN": JSON.stringify(bakedSentryDsn),
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
    define: {
      "process.env.SENTRY_DSN": JSON.stringify(bakedSentryDsn),
    },
    plugins: [react()],
    server: {
      // Use 5174 so root `npm run dev` can keep the IIVO web client on 5173.
      port: 5174,
      strictPort: false,
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
