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

if (envMode === "production" && !bakedSentryDsn) {
  console.warn(
    "[glass build] SENTRY_DSN is not set in the environment or repo root .env — packaged crash reports will be dropped.",
  );
}

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
      rollupOptions: {
        // TypeScript's runtime uses __filename — must load from node_modules as CJS, not bundle as ESM.
        external: ["typescript"],
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
    plugins: [
      react(),
      {
        name: "strip-crossorigin-for-file-protocol",
        transformIndexHtml(html: string) {
          let out = html.replace(/\s+crossorigin/g, "");
          if (process.env.NODE_ENV !== "production") {
            out = out.replace(
              "script-src 'self' 'unsafe-eval' blob:",
              "script-src 'self' 'unsafe-eval' 'unsafe-inline' blob:",
            );
          }
          return out;
        },
      },
    ],
    server: {
      // Use 5174 so root `npm run dev` can keep the IIVO web client on 5173.
      port: 5174,
      strictPort: true,
      host: "127.0.0.1",
      hmr: { overlay: false },
      warmup: {
        clientFiles: [
          "./index.html",
          "./overlay.html",
          "./command.html",
          "./src/renderer/dock/main.tsx",
          "./src/renderer/overlay/main.tsx",
          "./src/renderer/command/main.tsx",
        ],
      },
    },
    optimizeDeps: {
      entries: ["index.html", "overlay.html", "command.html"],
      include: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "lucide-react"],
    },
    worker: {
      format: "es",
    },
    build: {
      outDir: "out/renderer",
      modulePreload: false,
      rollupOptions: {
        // Only listed HTML entry points ship in the packaged app. Dev-only splash
        // prototypes (soundPrototypeMain.ts, backgroundPreviewMain.tsx) are never
        // imported from these entries and are excluded from the production bundle.
        input: {
          dock: resolve(__dirname, "index.html"),
          panel: resolve(__dirname, "panel.html"),
          overlay: resolve(__dirname, "overlay.html"),
          command: resolve(__dirname, "command.html"),
          splash: resolve(__dirname, "splash.html"),
          activation: resolve(__dirname, "activation.html"),
          notes: resolve(__dirname, "notes.html"),
          terminal: resolve(__dirname, "terminal.html"),
          research: resolve(__dirname, "research.html"),
          dashboard: resolve(__dirname, "dashboard.html"),
          settings: resolve(__dirname, "settings.html"),
        },
      },
    },
  },
});
